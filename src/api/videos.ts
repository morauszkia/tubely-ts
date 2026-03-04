import { respondWithJSON } from "./json";
import path from "path";
import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes, type UUID } from "crypto";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
    const MAX_UPLOAD_SIZE = 1 << 30;

    const { videoId } = req.params as { videoId?: UUID };
    if (!videoId) {
        throw new BadRequestError("Invalid Video ID");
    }

    const token = getBearerToken(req.headers);
    const userID = validateJWT(token, cfg.jwtSecret);

    const video = getVideo(cfg.db, videoId);
    if (!video) {
        throw new NotFoundError("Video not found");
    }
    if (video.userID !== userID) {
        throw new UserForbiddenError("You are not allowed to edit this video");
    }

    const formData = await req.formData();
    const videoFile = formData.get("video");
    if (!(videoFile instanceof File)) {
        throw new BadRequestError("Provide video file");
    }
    if (videoFile.size > MAX_UPLOAD_SIZE) {
        throw new BadRequestError("File size exceeds limit of 1GB");
    }
    if (videoFile.type !== "video/mp4") {
        throw new BadRequestError("Invalid file type. Please upload mp4 file");
    }

    const tempFilePath = path.join("/tmp", `${videoId}.mp4`);
    const key = `${randomBytes(32).toString("hex")}.mp4`;

    try {
        await Bun.write(tempFilePath, videoFile);
        const videoFileContent = Bun.file(tempFilePath);
        const s3file = cfg.s3Client.file(key, { bucket: cfg.s3Bucket });
        await s3file.write(videoFileContent, { type: "video/mp4" });
    } finally {
        await Bun.file(tempFilePath).delete();
    }
    const videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`;
    video.videoURL = videoURL;
    updateVideo(cfg.db, video);

    return respondWithJSON(200, null);
}
