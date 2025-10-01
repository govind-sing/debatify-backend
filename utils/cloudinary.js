import {v2 as cloudinary} from 'cloudinary';
import fs from 'fs';   // file system
import dotenv from "dotenv";
dotenv.config({path:'./.env'});

cloudinary.config({
    cloud_name:process.env.CLOUD_NAME,
    
    api_key:process.env.CLOUD_API_KEY,
    
    api_secret:process.env.CLOUD_API_SECRET,
});
// console.log('Cloudinary Configured with Key:', process.env.CLOUD_API_KEY);
// cloudinary.config();
// console.log('Cloudinary Configured with URL:', process.env.CLOUDINARY_URL);

const uploadToCloudinary = async (localFilePath) =>{
    try{
        if(!localFilePath) return null;
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type:'auto'
        })
        // file uploaded successfully
        // console.log('Cloudinary upload response:', response.url);
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return response;
    }catch(error){ 
        console.error("Cloudinary Upload Error:", error);
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return null;

    }
}
export {uploadToCloudinary};