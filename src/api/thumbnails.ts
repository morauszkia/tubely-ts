import { join } from "path";
import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
    data: ArrayBuffer;
    mediaType: string;
};

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
    const { videoId } = req.params as { videoId?: string };
    if (!videoId) {
        throw new BadRequestError("Invalid video ID");
    }

    const token = getBearerToken(req.headers);
    const userID = validateJWT(token, cfg.jwtSecret);

    console.log("uploading thumbnail for video", videoId, "by user", userID);

    const formData = await req.formData();
    const thumbnail = formData.get("thumbnail");

    if (!(thumbnail instanceof File)) {
        throw new BadRequestError("Invalid thumbnail file");
    }

    const MAX_UPLOAD_SIZE = 10 << 20;

    if (thumbnail.size > MAX_UPLOAD_SIZE) {
        throw new BadRequestError("File too big");
    }

    const mediaType = thumbnail.type;

    if (mediaType !== "image/jpeg" && mediaType !== "image/png") {
        throw new BadRequestError("Invalid file type");
    }

    const extension = mediaType.split("/")[1];
    const imageData = await thumbnail.arrayBuffer();

    const video = getVideo(cfg.db, videoId);

    if (userID !== video?.userID) {
        throw new UserForbiddenError("You are not allowed to upload thumbnail");
    }

    const filePath = join(cfg.assetsRoot, `${videoId}.${extension}`);
    Bun.write(filePath, imageData);

    video.thumbnailURL = `http://localhost:8091/assets/${videoId}.${extension}`;
    updateVideo(cfg.db, video);

    respondWithJSON(200, video);

    return respondWithJSON(200, null);
}
