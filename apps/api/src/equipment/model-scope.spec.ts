/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { BadRequestException } from "@nestjs/common";
import { CatalogService } from "../catalog/catalog.service";
import { EquipmentService } from "./equipment.service";

const actor = { userId: { toString: () => "actor" } } as any;

function model(exists: unknown = true) {
  return {
    exists: jest.fn().mockResolvedValue(exists),
    find: jest.fn(),
    countDocuments: jest.fn(),
  } as any;
}

function equipment(models: {
  itemModels?: any;
  units?: any;
  componentTypes?: any;
}) {
  const generic = model();
  return new EquipmentService(
    generic,
    generic,
    generic,
    models.itemModels ?? generic,
    generic,
    models.componentTypes ?? generic,
    generic,
    models.units ?? generic,
    generic,
    generic,
    generic,
    generic,
    generic,
    generic,
    { write: jest.fn() } as any,
  );
}

describe("Model scope between Device and Component", () => {
  it("rejects a Device Model when creating a Component", async () => {
    const itemModels = model(false);
    const service = equipment({
      itemModels,
      units: model(),
      componentTypes: model(),
    });

    try {
      await service.createPart(
        {
          code: "RAM-01",
          name: "RAM 8GB",
          trackingMode: "QUANTITY",
          unitId: "507f1f77bcf86cd799439011",
          componentTypeId: "507f1f77bcf86cd799439012",
          modelId: "507f1f77bcf86cd799439013",
        },
        actor,
      );
      fail("Expected Component creation to reject a Device Model");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "COMPONENT_MODEL_REFERENCE_INVALID",
      });
    }
    expect(itemModels.exists).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "COMPONENT" }),
    );
  });

  it("rejects a Component Model when creating a Device", async () => {
    const itemModels = model(false);
    const service = equipment({ itemModels });

    try {
      await service.createDevice(
        {
          assetCode: "DEV-01",
          modelId: "507f1f77bcf86cd799439013",
          techCondition: "GOOD",
        },
        actor,
      );
      fail("Expected Device creation to reject a Component Model");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "DEVICE_MODEL_REFERENCE_INVALID",
      });
    }
    expect(itemModels.exists).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "DEVICE" }),
    );
  });

  it("lists Component Models with a COMPONENT scope", async () => {
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const itemModels = {
      ...model(),
      find: jest.fn().mockReturnValue(query),
      countDocuments: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    const generic = model();
    const service = new CatalogService(
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      itemModels,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      { write: jest.fn() } as any,
    );

    await service.list("component-models", {});

    expect(itemModels.find).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "COMPONENT" }),
    );
  });

  it("creates an auxiliary catalog using only its name", async () => {
    const generic = model();
    const componentTypes = {
      ...model(false),
      create: jest.fn().mockImplementation((doc: Record<string, unknown>) =>
        Promise.resolve({
          _id: "507f1f77bcf86cd799439011",
          toObject: () => doc,
        }),
      ),
    };
    const service = new CatalogService(
      generic,
      generic,
      generic,
      generic,
      componentTypes,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      generic,
      { write: jest.fn() } as any,
    );

    const result = await service.create(
      "component-types",
      { name: "RAM" },
      actor,
    );

    expect(componentTypes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "RAM",
        code: expect.stringMatching(/^AUTO-[A-F0-9]{24}$/),
      }),
    );
    expect(result.data).toEqual(expect.objectContaining({ name: "RAM" }));
  });
});
