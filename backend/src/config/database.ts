import mongoose from 'mongoose';

export async function connectDatabase(): Promise<string> {
  const uri = process.env.MONGODB_URI || 'mongodb://10.176.2.237:27017/pawdoku';

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`🐾 Successfully connected to MongoDB at: ${uri}`);
    return uri;
  } catch (err: any) {
    console.error(`❌ Failed to connect to MongoDB at ${uri}: ${err.message}`);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
