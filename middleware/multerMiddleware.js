import multer from "multer";

const storage = multer.memoryStorage();

const allowedTypes = /jpeg|jpg|png|mp4|webm|mp3/;

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Allowed: jpeg, jpg, png, mp4, webm, mp3"
        )
      );
    }
  },
});
