import { Role } from "../../models/portal/role.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { Block } from "../../models/portal/block.models.js";
import { School } from "../../models/portal/school.models.js";
import { getEffectivePermissionCodes } from "./permission.service.js";

const uniqueIds = (values) => [...new Set(values.filter(Boolean).map(String))];

export const hasSchoolVisitAccess = async (user) => {
  if (!user) return false;
  const role = await Role.findById(user.roleId).select("code").lean();
  if (role?.code === "ADMIN") return true;
  const permissions = await getEffectivePermissionCodes(user._id, user.roleId);
  return permissions.includes("SCHOOL_VISIT_ACCESS");
};

export const getResolvedRegionAccess = async (userId) => {
  const access = await UserRegionAccess.find({ userId }).lean();
  const blockIds = uniqueIds(access.filter((item) => item.scope === "block").map((item) => item.blockId));
  const schoolIds = uniqueIds(access.filter((item) => item.scope === "school").map((item) => item.schoolId));

  const [blocks, schools] = await Promise.all([
    blockIds.length ? Block.find({ _id: { $in: blockIds }, isActive: true }).select("_id districtId").lean() : [],
    schoolIds.length ? School.find({ _id: { $in: schoolIds }, isActive: true }).select("_id districtId blockId").lean() : [],
  ]);

  const blockMap = new Map(blocks.map((item) => [String(item._id), item]));
  const schoolMap = new Map(schools.map((item) => [String(item._id), item]));

  return access.map((item) => {
    const resolved = { ...item };
    if (item.scope === "block" && item.blockId) {
      const block = blockMap.get(String(item.blockId));
      if (block) resolved.districtId = resolved.districtId || block.districtId;
    }
    if (item.scope === "school" && item.schoolId) {
      const school = schoolMap.get(String(item.schoolId));
      if (school) {
        resolved.districtId = resolved.districtId || school.districtId;
        resolved.blockId = resolved.blockId || school.blockId;
      }
    }
    return resolved;
  });
};

export const isSchoolAccessible = async (userId, schoolId) => {
  const access = await getResolvedRegionAccess(userId);
  if (access.some((item) => item.scope === "global")) return true;

  const school = await School.findOne({ _id: schoolId, isActive: true }).select("_id districtId blockId").lean();
  if (!school) return false;

  return access.some((item) => {
    if (item.scope === "district") return String(item.districtId) === String(school.districtId);
    if (item.scope === "block") return String(item.blockId) === String(school.blockId);
    if (item.scope === "school") return String(item.schoolId) === String(school._id);
    return false;
  });
};
