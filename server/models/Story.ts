import mongoose, { Document, Model, Schema } from "mongoose";

export interface IStory extends Document {
    user: string;
    mediaUrl: string;
    mediaType: "image" | "video";
    createdAt: Date;
}

const StorySchema = new Schema<IStory>({
    user: { type: String, required: true }, 
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ["image", "video"], required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 },
});

const Story: Model<IStory> = mongoose.model("Story", StorySchema);
export default Story;