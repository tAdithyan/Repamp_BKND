import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import { seedDefaultPermissions } from "./services/permission.service.js";
import { seedDefaultRoles } from "./services/role.service.js";
import { startRecurringPickupScheduler } from "./services/recurringPickup.service.js";
import { startMonthlyInvoiceScheduler } from "./services/monthlyInvoice.service.js";
import { startShiftCleanupScheduler } from "./services/shift.service.js";
import { startPickupExpiryScheduler } from "./services/pickupExpiry.service.js";
import { startExpoPushWorkers } from './services/expoPush.service.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Connect to MongoDB and start HTTP server
const startServer = async () => {
  try {
    await connectDB();
    await seedDefaultPermissions();
    console.log("🌱 Default Permissions seeded/verified");

    await seedDefaultRoles();
    console.log("🌱 Default Roles & Permissions mapping seeded/verified (ROL_1 to ROL_6)");
    await startRecurringPickupScheduler();
    await startPickupExpiryScheduler();
    await startMonthlyInvoiceScheduler();
    startExpoPushWorkers();
    startShiftCleanupScheduler();

    const server = app.listen(PORT,"0.0.0.0", () => {
      console.log(`=================================`);
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📖 Swagger Docs: http://localhost:${PORT}/api-docs`);
      console.log(`📄 Swagger JSON: http://localhost:${PORT}/api-docs.json`);
      console.log(`=================================`);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (err) => {
      console.error("UNHANDLED REJECTION! 💥 Shutting down...", err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...", err);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
