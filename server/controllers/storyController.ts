import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import Story from "../models/Story.js";
import User from "../models/User.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createStory = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
        res.status(400).json({ success: false, message: "Media file is required" });
        return;
    }

    try {
        // ✅ FIX: File ko local 'uploads' folder mein save karo
        const uploadsDir = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const extension = file.mimetype.startsWith("video") ? "mp4" : "jpg";
        const fileName = `${Date.now()}-story.${extension}`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const story = await Story.create({
            user: userId,
            mediaUrl: `http://localhost:3000/uploads/${fileName}`,
            mediaType: extension === "mp4" ? "video" : "image",
        });

        // ✅ Fetch real user info
        const user = await User.findById(userId).select("name avatar handle");

        res.status(201).json({ success: true, story: { ...story.toObject(), user } });
    } catch (err: any) {
        console.error("Story upload error ", err);
        res.status(500).json({ success: false, message: "Story upload failed" });
        return;
    }
};

export const getStories = async (req: AuthRequest, res: Response) => {
    try {
        const stories = await Story.find().sort({ createdAt: -1 });

        if (stories.length === 0) {
            return res.status(200).json({ success: true, stories: [] });
        }

        const grouped: any = {};

        for (const s of stories) {
            const uid = String(s.user);

            if (!grouped[uid]) {
                const realUser = await User.findById(uid).select("name avatar handle");
                grouped[uid] = {
                    user: realUser || { _id: uid, name: "User", avatar: "", handle: "" },
                    stories: [],
                };
            }
            grouped[uid].stories.push(s);
        }

        res.json({ success: true, stories: Object.values(grouped) });
    } catch (error) {
        console.error("Error fetching stories:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stories" });
    }
};