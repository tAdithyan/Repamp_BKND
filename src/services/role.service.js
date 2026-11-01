import Role from "../models/role.model.js";
import Permission from "../models/permission.model.js";
import { CONSTANT_ROLES_LIST } from "../constants/roles.js";
import ApiError from "../utils/apiError.js";
import User from "../models/user.model.js";

// Seed roles and attach relevant permission references
export const seedDefaultRoles = async () => {
  const allPermissions = await Permission.find({});
  const permMap = allPermissions.reduce((acc, p) => {
    acc[p.permissionId] = p._id;
    return acc;
  }, {});

  const getPermIds = (ids) => ids.map((id) => permMap[id]).filter(Boolean);

  const rolePermissionAssignments = {
    ROL_1: Object.values(permMap), // SuperAdmin gets all permissions
    ROL_2: getPermIds([
      "PERM_USER_READ", "PERM_USER_CREATE", "PERM_USER_UPDATE",
      "PERM_COLLECTION_READ", "PERM_COLLECTION_CREATE", "PERM_COLLECTION_UPDATE", "PERM_COLLECTION_MANAGE",
      "PERM_PICKUP_READ", "PERM_PICKUP_UPDATE", "PERM_PICKUP_CANCEL",
      "PERM_BIN_READ", "PERM_BIN_UPDATE",
      "PERM_LOCATION_MANAGE", "PERM_MAP_READ", "PERM_REPORTS_READ", "PERM_REPORTS_EXPORT"
    ]),
    ROL_3: getPermIds([
      "PERM_USER_READ", "PERM_COLLECTION_READ", "PERM_COLLECTION_UPDATE", "PERM_LOCATION_MANAGE", "PERM_MAP_READ", "PERM_REPORTS_READ",
      "PERM_PICKUP_READ", "PERM_PICKUP_UPDATE",
      "PERM_BIN_READ", "PERM_BIN_UPDATE"
    ]),
    ROL_4: getPermIds([
      "PERM_COLLECTION_READ", "PERM_COLLECTION_UPDATE",
      "PERM_PICKUP_READ", "PERM_PICKUP_UPDATE", "PERM_PICKUP_COMPLETE",
      "PERM_BIN_READ", "PERM_BIN_UPDATE"
    ]),
    ROL_5: getPermIds([
      "PERM_COLLECTION_CREATE", "PERM_COLLECTION_READ",
      "PERM_PICKUP_READ", "PERM_PICKUP_CREATE", "PERM_PICKUP_CANCEL"
    ]),
    ROL_6: getPermIds([
      "PERM_USER_READ",
      "PERM_COLLECTION_READ", "PERM_COLLECTION_CREATE", "PERM_COLLECTION_UPDATE",
      "PERM_PICKUP_READ", "PERM_PICKUP_CREATE", "PERM_PICKUP_UPDATE", "PERM_PICKUP_CANCEL", "PERM_PICKUP_COMPLETE",
      "PERM_BIN_READ",
      "PERM_REPORTS_READ", "PERM_REPORTS_EXPORT"
    ]),
  };

  for (const roleData of CONSTANT_ROLES_LIST) {
    const permissions = rolePermissionAssignments[roleData.roleId] || [];
    await Role.updateOne(
      { roleId: roleData.roleId },
      { $set: roleData, $setOnInsert: { permissions } },
      { upsert: true }
    );
  }
  // Keep the superadmin role fully privileged while preserving permission
  // choices made for every other role in Permission Management.
  await Role.updateOne(
    { roleId: "ROL_1" },
    { $set: { permissions: Object.values(permMap) } }
  );
  await User.updateMany(
    { role: { $in: ["CLIENT_ADMIN", "ROLE_6"] } },
    { $set: { role: "ROL_6" } }
  );
};

export const getAllRolesService = async () => {
  const roles = await Role.find({})
    .populate({
      path: "permissions",
      select: "permissionId name",
    })
    .sort({ roleId: 1 });

  return roles;
};

export const getRoleByIdService = async (id) => {
  const searchKey = id.trim().toUpperCase();
  let role = await Role.findOne({
    $or: [{ roleId: searchKey }, { name: id }],
  }).populate("permissions");

  if (!role) {
    throw new ApiError(
      404,
      `Role '${id}' is invalid. Allowed roles are: ROL_1 (SuperAdmin), ROL_2 (Admin), ROL_3 (Cordinator), ROL_4 (CollectionAgent), ROL_5 (User), ROL_6 (CLIENT_ADMIN)`
    );
  }

  return role;
};

export const updateRolePermissionsService = async (id, permissionIds) => {
  const searchKey = id.trim().toUpperCase();
  const role = await Role.findOne({
    $or: [{ roleId: searchKey }, { name: id }],
  });

  if (!role) {
    throw new ApiError(404, `Role '${id}' not found`);
  }

  if (!Array.isArray(permissionIds)) {
    throw new ApiError(400, "permissionIds must be an array of Permission IDs or permissionId codes");
  }

  // Resolve permission ObjectIds from permissionId codes or Mongo ObjectIds
  const resolvedPermissions = await Permission.find({
    $or: [
      { _id: { $in: permissionIds.filter((p) => p.match(/^[0-9a-fA-F]{24}$/)) } },
      { permissionId: { $in: permissionIds.map((p) => p.toString().toUpperCase()) } },
    ],
  });

  const permObjectIds = resolvedPermissions.map((p) => p._id);

  role.permissions = permObjectIds;
  await role.save();

  return await Role.findById(role._id).populate("permissions");
};
