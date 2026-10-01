import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { School } from "../../models/portal/school.models.js";
import { Role } from "../../models/portal/role.models.js";
import { User } from "../../models/portal/user.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";

const DUMMY = {
  district: { districtId: "DUMMY-001", districtName: "Dummy District" },
  blocks: [
    { blockId: "BLK-001", blockName: "Dummy Block 1" },
    { blockId: "BLK-002", blockName: "Dummy Block 2" },
  ],
  schools: [
    { schoolCode: "SCH-001", schoolName: "Dummy Government School 1", blockId: "BLK-001" },
    { schoolCode: "SCH-002", schoolName: "Dummy Government School 2", blockId: "BLK-001" },
    { schoolCode: "SCH-003", schoolName: "Dummy Government School 3", blockId: "BLK-002" },
  ],
};

const ROLE_SEED = [
  ["ACI", "ACI"],
  ["Center Coordinator", "CENTER_COORDINATOR"],
  ["HKRN", "HKRN"],
  ["ABRC", "ABRC"],
  ["Principal", "PRINCIPAL"],
  ["Teacher", "TEACHER"],
  ["School Staff", "SCHOOL_STAFF"],
  ["Vikalpa Staff", "VIKALPA_STAFF"],
  ["Admin", "ADMIN"],
];

export const seedRoles = async () => {
  await Role.updateMany({ code: { $nin: ROLE_SEED.map(([, code]) => code) } }, { $set: { isSelfSelectable: false, isActive: false } });
  for (const [name, code] of ROLE_SEED) {
    await Role.updateOne(
      { code },
      {
        $set: {
          name,
          description: `${name} portal role`,
          isActive: true,
          isSelfSelectable: code !== "ADMIN",
        },
        $setOnInsert: { code },
      },
      { upsert: true }
    );
  }
};

export const seedAdmin = async () => {
  const adminRole = await Role.findOne({ code: "ADMIN", isActive: true });
  if (!adminRole) throw new Error("ADMIN role could not be seeded");

  // Required behavior: check by userId first. Never create a second admin on restart.
  const existing = await User.findOne({ userId: "admin" });
  if (existing) {
    existing.roleId = adminRole._id;
    existing.isActive = true;
    existing.isVerified = true;
    if (!existing.password) existing.password = process.env.ADMIN_PASSWORD || "vikalpa@123";
    await existing.save();
    await UserRegionAccess.updateOne(
      { userId: existing._id, scope: "global" },
      { $setOnInsert: { userId: existing._id, scope: "global" } },
      { upsert: true }
    );
    console.log("Admin already exists. Verified/admin state repaired; no duplicate created.");
    return existing;
  }

  const contact = process.env.ADMIN_CONTACT || "9999999999";
  const contactOwner = await User.findOne({ contact });

  if (contactOwner) {
    throw new Error(
      `Cannot seed admin: ADMIN_CONTACT ${contact} is already used by another user.`
    );
  }

  const admin = await User.create({
    userId: "admin",
    name: process.env.ADMIN_NAME || "Portal Administrator",
    contact,
    password: process.env.ADMIN_PASSWORD || "vikalpa@123",
    roleId: adminRole._id,
    isActive: true,
    isVerified: true,
  });

  await UserRegionAccess.updateOne(
    { userId: admin._id, scope: "global" },
    { $setOnInsert: { userId: admin._id, scope: "global" } },
    { upsert: true }
  );

  console.log("Admin created successfully.");
  return admin;
};

export const seedDummyRegions = async () => {
  const district = await District.findOneAndUpdate(
    { districtId: DUMMY.district.districtId },
    { $set: { districtName: DUMMY.district.districtName, isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const blockMap = new Map();

  for (const item of DUMMY.blocks) {
    const block = await Block.findOneAndUpdate(
      { districtId: district._id, blockId: item.blockId },
      {
        $set: {
          districtId: district._id,
          blockName: item.blockName,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    blockMap.set(item.blockId, block);
  }

  for (const item of DUMMY.schools) {
    const block = blockMap.get(item.blockId);

    await School.findOneAndUpdate(
      { schoolCode: item.schoolCode },
      {
        $set: {
          schoolName: item.schoolName,
          districtId: district._id,
          blockId: block._id,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
};

export const seedData = async () => {
  await seedRoles();
  await seedAdmin();
  await seedDummyRegions();

  console.log(
    "Seed complete: users, roles, districts, blocks, schools. No external ERP data is imported."
  );
};
