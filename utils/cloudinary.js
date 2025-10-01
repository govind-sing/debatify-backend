import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Upload file buffer directly using upload_stream
const uploadToCloudinary = async (fileBuffer) => {
  try {
    return await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "auto" },
        (error, result) => {
          if (result) resolve(result);
          else reject(error);
        }
      );
      stream.end(fileBuffer); // send buffer to Cloudinary
    });
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
};

export { uploadToCloudinary };
