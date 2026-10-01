import { UserDashboardAccess } from "../../models/portal/userDashboardAccess.models.js";
import { RoleDashboardAccess } from "../../models/portal/roleDashboardAccess.models.js";

// Effective grants are additive: individual grants never erase role grants.
export const effectiveDashboardAccess = async (userId, roleId) => {
  const [userGrant, roleGrant] = await Promise.all([
    UserDashboardAccess.findOne({ userId }).select("dashboards").lean(),
    roleId ? RoleDashboardAccess.findOne({ roleId }).select("dashboards").lean() : null,
  ]);
  return [...new Set([...(roleGrant?.dashboards || []), ...(userGrant?.dashboards || [])])];
};
