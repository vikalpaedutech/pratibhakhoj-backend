import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { School } from "../../models/portal/school.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const getUserAccess=asyncHandler(async(req,res)=>{
 const rows=await UserRegionAccess.find({userId:req.params.userId}).populate("districtId","districtName").populate("blockId","blockName").populate("schoolId","schoolName").lean();
 res.json(new ApiResponse(200,rows,"User region access fetched"));
});
export const replaceUserAccess=asyncHandler(async(req,res)=>{
 const {scope,regions=[]}=req.body;
 if(!["global","district","block","school"].includes(scope)) throw new ApiError(400,"Invalid scope");
 await UserRegionAccess.deleteMany({userId:req.params.userId});
 if(scope==="global"){await UserRegionAccess.create({userId:req.params.userId,scope});}
 else {
  for(const r of regions){
   if(scope==="district" && !await District.exists({_id:r.districtId,isActive:true})) throw new ApiError(400,"Invalid district");
   if(scope==="block" && !await Block.exists({_id:r.blockId,districtId:r.districtId,isActive:true})) throw new ApiError(400,"Invalid block");
   if(scope==="school" && !await School.exists({_id:r.schoolId,districtId:r.districtId,blockId:r.blockId,isActive:true})) throw new ApiError(400,"Invalid school");
   await UserRegionAccess.create({userId:req.params.userId,scope,districtId:r.districtId||null,blockId:r.blockId||null,schoolId:r.schoolId||null});
  }
 }
 res.json(new ApiResponse(200,await UserRegionAccess.find({userId:req.params.userId}).lean(),"Region access updated"));
});
