import bcrypt from "bcrypt";
import { User } from "../../models/portal/user.models.js";
import { Role } from "../../models/portal/role.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const listUsers = asyncHandler(async (_req,res)=>{
  const users=await User.find().populate("roleId","name code").select("-password -refreshToken -otp -registrationTokenHash -registrationTokenExpiresAt").sort({createdAt:-1}).lean();
  res.json(new ApiResponse(200,users,"Users fetched successfully"));
});
export const createUser = asyncHandler(async(req,res)=>{
  const {name,contact,password,roleId,isActive=true}=req.body;
  if(!name||!contact||!password||!roleId) throw new ApiError(400,"Name, contact, password and role are required");
  if(!/^[0-9]{10}$/.test(contact) && contact!=="admin") throw new ApiError(400,"Contact must be 10 digits or admin");
  if(await User.exists({contact})) throw new ApiError(409,"Contact already exists");
  const role=await Role.findOne({_id:roleId,isActive:true}); if(!role) throw new ApiError(400,"Invalid role");
  const user=await User.create({userId:contact==="admin"?"admin":`USR-${Date.now().toString(36).toUpperCase()}`,name,contact,password,roleId,isActive,isVerified:true});
  res.status(201).json(new ApiResponse(201,user,"User created successfully"));
});
export const listRoles = asyncHandler(async(_req,res)=>res.json(new ApiResponse(200,await Role.find({isActive:true}).sort({name:1}).lean(),"Roles fetched successfully")));
export const updateUser = asyncHandler(async(req,res)=>{
  const user=await User.findById(req.params.id); if(!user) throw new ApiError(404,"User not found");
  const allowed=["name","roleId","isActive"]; for(const k of allowed) if(req.body[k]!==undefined) user[k]=req.body[k];
  await user.save(); res.json(new ApiResponse(200,user,"User updated successfully"));
});
