import multer from "multer";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  ACCEPTED_AUDIO_FORMAT_LABEL,
  ACCEPTED_AUDIO_MIME_TYPES,
  AUDIO_LIMIT_BYTES
} from "../shared/defaults";

export const upload = multer({
  storage: multer.diskStorage({
    destination: tmpdir(),
    filename(_req, file, callback) {
      callback(null, `tart-audio-${randomUUID()}-${file.originalname.replace(/[^a-z0-9._-]/gi, "_")}`);
    }
  }),
  limits: { fileSize: AUDIO_LIMIT_BYTES },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    const hasAcceptedMimeType = ACCEPTED_AUDIO_MIME_TYPES.includes(file.mimetype as never);
    const hasAcceptedExtension = ACCEPTED_AUDIO_EXTENSIONS.includes(extension as never);

    if (hasAcceptedMimeType && hasAcceptedExtension) {
      callback(null, true);
      return;
    }

    callback(new Error(`Unsupported audio format. Use ${ACCEPTED_AUDIO_FORMAT_LABEL}.`));
  }
});
