import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import XLSX from "xlsx";
import { School } from "../../models/portal/school.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const addRegion = asyncHandler(async (req,res)=>{
  const { districtName,districtId,blockName,blockId,schoolName,schoolCode }=req.body;
  if(!districtName||!districtId||!blockName||!blockId||!schoolName||!schoolCode) throw new ApiError(400,"districtName, districtId, blockName, blockId, schoolName and schoolCode are required");
  const district=await District.findOneAndUpdate({districtId},{ $set:{districtName,isActive:true}},{upsert:true,new:true,setDefaultsOnInsert:true});
  const block=await Block.findOneAndUpdate({districtId:district._id,blockId},{ $set:{blockName,isActive:true}},{upsert:true,new:true,setDefaultsOnInsert:true});
  const school=await School.findOneAndUpdate({schoolCode},{ $set:{schoolName,districtId:district._id,blockId:block._id,isActive:true}},{upsert:true,new:true,setDefaultsOnInsert:true});
  res.status(201).json(new ApiResponse(201,{district,block,school},"Region added successfully"));
});
export const updateDistrict=asyncHandler(async(req,res)=>{const x=await District.findByIdAndUpdate(req.params.id,req.body,{new:true});if(!x)throw new ApiError(404,"District not found");res.json(new ApiResponse(200,x,"District updated"));});
export const updateBlock=asyncHandler(async(req,res)=>{const x=await Block.findByIdAndUpdate(req.params.id,req.body,{new:true});if(!x)throw new ApiError(404,"Block not found");res.json(new ApiResponse(200,x,"Block updated"));});
export const updateSchool=asyncHandler(async(req,res)=>{const x=await School.findByIdAndUpdate(req.params.id,req.body,{new:true});if(!x)throw new ApiError(404,"School not found");res.json(new ApiResponse(200,x,"School updated"));});
export const deactivateDistrict=asyncHandler(async(req,res)=>{const x=await District.findByIdAndUpdate(req.params.id,{$set:{isActive:false}},{new:true});if(!x)throw new ApiError(404,"District not found");res.json(new ApiResponse(200,x,"District deactivated"));});
export const deactivateBlock=asyncHandler(async(req,res)=>{const x=await Block.findByIdAndUpdate(req.params.id,{$set:{isActive:false}},{new:true});if(!x)throw new ApiError(404,"Block not found");res.json(new ApiResponse(200,x,"Block deactivated"));});
export const deactivateSchool=asyncHandler(async(req,res)=>{const x=await School.findByIdAndUpdate(req.params.id,{$set:{isActive:false}},{new:true});if(!x)throw new ApiError(404,"School not found");res.json(new ApiResponse(200,x,"School deactivated"));});

export const regionTemplate = asyncHandler(async (_req,res)=>{
 const ws=XLSX.utils.aoa_to_sheet([["districtName","districtId","blockName","blockId","schoolName","schoolCode"],["Example District","D-001","Example Block","B-001","Example School","S-001"]]);
 const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Regions");
 const buffer=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 res.setHeader("Content-Disposition",'attachment; filename="region-bulk-template.xlsx"');
 res.send(buffer);
});
export const bulkRegionUpload=asyncHandler(async(req,res)=>{
 if(!req.file) throw new ApiError(400,"Excel file is required");
 const wb=XLSX.read(req.file.buffer,{type:"buffer"}); const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
 const errors=[],added=[];
 for(let i=0;i<rows.length;i++){const r=rows[i];try{
   if(!r.districtName||!r.districtId||!r.blockName||!r.blockId||!r.schoolName||!r.schoolCode) throw new Error("All six columns are required");
   const district=await District.findOneAndUpdate({districtId:String(r.districtId).trim()},{$set:{districtName:String(r.districtName).trim(),isActive:true}},{upsert:true,new:true,setDefaultsOnInsert:true});
   const block=await Block.findOneAndUpdate({districtId:district._id,blockId:String(r.blockId).trim()},{$set:{blockName:String(r.blockName).trim(),isActive:true}},{upsert:true,new:true,setDefaultsOnInsert:true});
   const school=await School.findOneAndUpdate({schoolCode:String(r.schoolCode).trim()},{$set:{schoolName:String(r.schoolName).trim(),districtId:district._id,blockId:block._id,isActive:true}},{upsert:true,new:true,setDefaultsOnInsert:true});
   added.push({row:i+2,district:district.districtName,block:block.blockName,school:school.schoolName});
 }catch(e){errors.push({row:i+2,message:e.message})}}
 res.json(new ApiResponse(200,{added,errors},"Region bulk upload completed"));
});
