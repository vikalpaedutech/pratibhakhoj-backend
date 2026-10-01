import { Role } from "../../models/portal/role.models.js";
import { UserDashboardAccess } from "../../models/portal/userDashboardAccess.models.js";
import { RoleDashboardAccess } from "../../models/portal/roleDashboardAccess.models.js";

export const getEffectiveDashboardAccess = async (user) => {
  if (!user) return [];

  const role = await Role.findById(user.roleId).select("code").lean();
  if (role?.code === "ADMIN") return null; // null means unrestricted admin access

  const [userAccess, roleAccess] = await Promise.all([
    UserDashboardAccess.findOne({ userId: user._id }).select("dashboards").lean(),
    RoleDashboardAccess.findOne({ roleId: user.roleId }).select("dashboards").lean(),
  ]);

  return [...new Set([...(roleAccess?.dashboards || []), ...(userAccess?.dashboards || [])])];
};

export const hasEffectiveDashboardAccess = async (user, code) => {
  const access = await getEffectiveDashboardAccess(user);
  return access === null || access.includes(code);
};

export const getAllRegistrationDashboardCode = (examType) => {
  const exam = String(examType || "").toUpperCase();
  if (exam === "MB") return "MB_ALL_REGISTRATIONS";
  if (exam === "HS100") return "HS100_ALL_REGISTRATIONS";
  return null;
};

export const hasAllRegistrationAccess = async (user, examType) => {
  const code = getAllRegistrationDashboardCode(examType);
  return Boolean(code) && hasEffectiveDashboardAccess(user, code);
};
