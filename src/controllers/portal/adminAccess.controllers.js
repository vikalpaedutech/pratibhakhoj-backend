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
 let {regions=[]}=req.body;
 if(req.body.scope === "global") regions = [{scope:"global"}];
 else if(req.body.scope && Array.isArray(regions) && regions.every(r => !r.scope)) regions = regions.map(r => ({...r,scope:req.body.scope}));
 if(!Array.isArray(regions)) throw new ApiError(400,"regions must be an array");
 const normalized=[];
 for(const r of regions){
  const scope=r.scope;
  if(scope === "global") { normalized.length = 0; normalized.push({scope:"global",districtId:null,blockId:null,schoolId:null}); break; }
  if(!["district","block","school"].includes(scope)) throw new ApiError(400,"Invalid region scope");
  if(scope==="district"){
   if(!r.districtId || !await District.exists({_id:r.districtId,isActive:true})) throw new ApiError(400,"Invalid district");
   normalized.push({scope,districtId:r.districtId,blockId:null,schoolId:null});
  } else if(scope==="block"){
   if(!r.districtId || !r.blockId || !await Block.exists({_id:r.blockId,districtId:r.districtId,isActive:true})) throw new ApiError(400,"Invalid block");
   normalized.push({scope,districtId:r.districtId,blockId:r.blockId,schoolId:null});
  } else {
   if(!r.districtId || !r.blockId || !r.schoolId || !await School.exists({_id:r.schoolId,districtId:r.districtId,blockId:r.blockId,isActive:true})) throw new ApiError(400,"Invalid school");
   normalized.push({scope,districtId:r.districtId,blockId:r.blockId,schoolId:r.schoolId});
  }
 }
 await UserRegionAccess.deleteMany({userId:req.params.userId});
 if(normalized.length) await UserRegionAccess.insertMany(normalized.map(row=>({userId:req.params.userId,...row})),{ordered:true});
 const rows=await UserRegionAccess.find({userId:req.params.userId}).populate("districtId","districtName").populate("blockId","blockName").populate("schoolId","schoolName").lean();
 res.json(new ApiResponse(200,rows,"Region access updated"));
});
