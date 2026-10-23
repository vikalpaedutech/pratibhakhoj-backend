// import mongoose from "mongoose";

// export const db = mongoose.connection;

// const connectDb = async () => {
//   const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
//   if (!uri) throw new Error("MONGODB_URI is required");

//   await mongoose.connect(uri, {
//     // dbName: process.env.DB_NAME || "pratibhakhojVikalpa",
    
//      dbName: process.env.DB_NAME || "pratibhakhojVikalpaTesting",

//   });

//   console.log(`MongoDB connected: ${process.env.DB_NAME || "pratibhakhojVikalpa"}`);
// };

// export default connectDb;











import mongoose from "mongoose";

export const db = mongoose.connection;

const connectDb = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGODB_URI or MONGO_URI is required");
  }

  const dbName = process.env.DB_NAME || "pratibhakhojVikalpaTesting";

  await mongoose.connect(uri, { dbName });

  console.log(`MongoDB connected: ${mongoose.connection.name}`);
};

export default connectDb;
