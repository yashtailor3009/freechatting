import mongoose from "mongoose"

const connectDB = async()=>{
    mongoose.connection.on('connected', async()=> console.log('MongoDB connected'));

    if(!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not defined")
    await mongoose.connect(process.env.MONGODB_URI)
}

export default connectDB;