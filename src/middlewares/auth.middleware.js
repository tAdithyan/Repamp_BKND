// file: src/middlewares/auth.middleware.js
import jwt from 'jsonwebtoken';
import ApiError from '../utils/apiError.js';
import User from '../models/user.model.js';
import { admin } from "../config/firebaseAdmin.js";
import { performance } from 'node:perf_hooks';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Verify JWT token sent in Authorization header.
 * Attaches verified user document to req.user.
 */
export const protect = async (req, res, next) => {
  const diagnosticStartedAt = req.pickupDetailsDiagnostics ? performance.now() : null;
  let tokenVerifyMs = null;
  let userLookupMs = null;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing or malformed Authorization header');
    }
    const token = authHeader.split(' ')[1];
    const verifyStartedAt = req.pickupDetailsDiagnostics ? performance.now() : null;
    const decoded = jwt.verify(token, JWT_SECRET);
    if (verifyStartedAt !== null) tokenVerifyMs = performance.now() - verifyStartedAt;
    if (!decoded.id || decoded.purpose) throw new ApiError(401, 'Complete registration before signing in');
    const userLookupStartedAt = req.pickupDetailsDiagnostics ? performance.now() : null;
    const user = await User.findById(decoded.id).select('-password');
    if (userLookupStartedAt !== null) userLookupMs = performance.now() - userLookupStartedAt;
    if (!user) throw new ApiError(401, 'User no longer exists');
    req.user = user;
    if (diagnosticStartedAt !== null) console.info(JSON.stringify({
      event: 'pickup_details_auth',
      tokenVerifyMs: Number(tokenVerifyMs.toFixed(1)),
      userLookupMs: Number(userLookupMs.toFixed(1)),
    }));
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired – please login again'
      : err.message || 'Authentication failed';
    next(new ApiError(401, message));
  }
};

/**
 * Helper to issue a JWT for a given user id.
 */
export const signToken = (id) =>
  jwt.sign({ id }, JWT_SECRET);

export const signRegistrationToken = (mobile) =>
  jwt.sign({ mobile, purpose: 'registration' }, JWT_SECRET, { expiresIn: '30m' });

export const requireRegistration = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new Error('Phone verification required');
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    if (decoded.purpose !== 'registration' || typeof decoded.mobile !== 'string') {
      throw new Error('Phone verification required');
    }
    req.registrationMobile = decoded.mobile;
    next();
  } catch {
    next(new ApiError(401, 'Phone verification expired or invalid. Please verify your number again.'));
  }
};

// Only read-only location lookups accept a pending registration credential.
export const protectLocation = (req, res, next) => {
  try {
    const decoded = jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET);
    if (decoded.purpose === 'registration') return requireRegistration(req, res, next);
  } catch { /* Normal authentication reports the error. */ }
  return protect(req, res, next);
};





const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.split("Bearer ")[1];

    const decodedToken = await admin.auth().verifyIdToken(token);

    req.firebaseUser = decodedToken;

    next();
  } catch (error) {
    console.error("Firebase authentication error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export default authMiddleware;
