// file: src/middlewares/role.middleware.js
import ApiError from '../utils/apiError.js';
import Role from '../models/role.model.js';
import { performance } from 'node:perf_hooks';

/**
 * Returns middleware that ensures the authenticated user has at least one of the required permissions.
 * requiredPermissions – array of permissionId strings (e.g., ['PERM_USER_READ']).
 */
export const authorize = (requiredPermissions = []) => {
  return async (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'User not authenticated'));
    try {
      const startedAt = req.pickupDetailsDiagnostics ? performance.now() : null;
      const roleDoc = await Role.findOne({ $or: [{ name: req.user.role }, { roleId: req.user.role }] })
        .select('permissions')
        .populate({ path: 'permissions', select: 'permissionId' })
        .lean();
      if (startedAt !== null) console.info(JSON.stringify({
        event: 'pickup_details_authorization',
        roleAndPermissionsMs: Number((performance.now() - startedAt).toFixed(1)),
      }));
      if (!roleDoc) {
        return next(new ApiError(403, `Role '${req.user.role}' not found`));
      }
      const userPermIds = roleDoc.permissions.map(p => p.permissionId || p._id?.toString());
      const hasPermission = requiredPermissions.some((perm) => userPermIds.includes(perm));
      if (!hasPermission) {
        return next(
          new ApiError(
            403,
            `Insufficient permissions – required: ${requiredPermissions.join(', ')}`
          )
        );
      }
      next();
    } catch (err) {
      next(new ApiError(500, err.message));
    }
  };
};
