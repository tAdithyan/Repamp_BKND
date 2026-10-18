import Pickup from "../models/pickup.modal.js";
import RecurringPickup from "../models/recurringPickup.model.js";
import { assertPickupDistrictServiceable } from './serviceArea.service.js';
import { notifyPickupEvent } from './notification.service.js';

const dateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const generateRecurringPickupsOnce = async (now) => {
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const contracts = await RecurringPickup.find({
    isActive: true,
    collectionDays: now.getDay(),
    startDate: { $lte: endOfDay },
    $or: [{ endDate: null }, { endDate: { $gte: startOfDay } }],
  });
  let generated = 0;
  for (const contract of contracts) {
    const [hours, minutes] = contract.preferredTime.split(":").map(Number);
    const preferredDate = new Date(now);
    preferredDate.setHours(hours, minutes, 0, 0);
    const generationKey = `${contract._id}:${dateKey(now)}`;
    try {
      const alreadyGenerated = await Pickup.exists({
        $or: [
          { recurringGenerationKey: generationKey },
          {
            recurringContractId: contract._id,
            preferredDate: { $gte: startOfDay, $lte: endOfDay },
          },
        ],
      });
      if (alreadyGenerated) continue;

      if (!contract.pickupLocation.type) contract.pickupLocation.type = "Point";
      await assertPickupDistrictServiceable(contract.pickupLocation.coordinates[0], contract.pickupLocation.coordinates[1]);
      const pickup = await Pickup.create({
        customerId: contract.customerId,
        operatorId: contract.operatorId || null,
        status: contract.operatorId ? "assigned" : "scheduled",
        wasteType: contract.wasteType,
        preferredDate,
        pickupLocation: {
          type: "Point",
          coordinates: contract.pickupLocation.coordinates,
        },
        ratePerKg: contract.ratePerKg,
        recurringContractId: contract._id,
        recurringGenerationKey: generationKey,
        notes: [`Recurring collection: ${contract.name}`, contract.address, contract.notes].filter(Boolean).join(". "),
      });
      const reminder = `A recurring collection is scheduled for today at ${contract.preferredTime}.`;
      await Promise.all([
        notifyPickupEvent({ recipientId: contract.customerId, pickupId: pickup._id, event: 'recurring_pickup_reminder', title: 'Recurring pickup today', message: reminder }),
        contract.operatorId ? notifyPickupEvent({ recipientId: contract.operatorId, pickupId: pickup._id, event: 'pickup_assigned', title: 'Recurring pickup assigned', message: `${pickup.pickupId} is scheduled for today at ${contract.preferredTime}.` }) : Promise.resolve(),
      ]);
      contract.lastGeneratedDate = now;
      await contract.save();
      generated += 1;
    } catch (error) {
      if (error?.statusCode === 403) {
        console.warn(`Skipped recurring pickup in a disabled or unsupported district for contract ${contract._id}.`);
        continue;
      }
      if (error?.code !== 11000) throw error;
    }
  }
  return generated;
};

let generationRun = null;
export const generateRecurringPickups = (now = new Date()) => {
  // A contract may be saved while the scheduled pass is already querying
  // contracts. Wait for that pass, then run again so the newly saved contract
  // is included instead of inheriting a stale result.
  if (generationRun) return generationRun.then(() => generateRecurringPickups(now));
  generationRun = generateRecurringPickupsOnce(now).finally(() => { generationRun = null; });
  return generationRun;
};

let generationTimer;
export const startRecurringPickupScheduler = async () => {
  await generateRecurringPickups().catch((error) => console.error("Recurring pickup generation failed:", error));
  if (!generationTimer) generationTimer = setInterval(
    () => generateRecurringPickups().catch((error) => console.error("Recurring pickup generation failed:", error)),
    15 * 60 * 1000
  );
};
