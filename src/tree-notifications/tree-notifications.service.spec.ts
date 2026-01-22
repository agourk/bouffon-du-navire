import { Test, TestingModule } from "@nestjs/testing";
import { TreeNotificationsService } from "./tree-notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { DiscordLoggerService } from "../logger/discord-logger.service";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import { EmbedBuilder, MessageFlagsBitField } from "discord.js";

describe("TreeNotificationsService", () => {
  let service: TreeNotificationsService;
  let prismaService: PrismaService;
  let loggerService: DiscordLoggerService;
  let configService: ConfigService;
  let schedulerRegistry: SchedulerRegistry;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreeNotificationsService,
        {
          provide: PrismaService,
          useValue: {
            treeNotifications_Preferences: {
              findMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: DiscordLoggerService,
          useValue: {
            setContext: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                TREE_NOTIF_MESSAGE_ID: "123456789",
                TREE_NOTIF_MESSAGE_CHANNEL_ID: "987654321",
                TREE_NOTIF_CHANNEL_ID: "111222333",
                TREE_NOTIF_ROLE_ID: "444555666",
              };
              return config[key];
            }),
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: {
            addTimeout: jest.fn(),
            deleteTimeout: jest.fn(),
            doesExist: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TreeNotificationsService>(TreeNotificationsService);
    prismaService = module.get<PrismaService>(PrismaService);
    loggerService = module.get<DiscordLoggerService>(DiscordLoggerService);
    configService = module.get<ConfigService>(ConfigService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("treeNotificationsInfoCommand", () => {
    it("should display statistics with no users", async () => {
      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn(prismaService.treeNotifications_Preferences, "findMany").mockResolvedValue([]);

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: "📊 Statistiques des notifications d'arrosage",
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: "👥 Utilisateurs inscrits",
                  value: "0 utilisateur(s) ont configuré leurs préférences",
                }),
                expect.objectContaining({
                  name: "✅ Notifications activées",
                  value: "0 utilisateur(s) recevront des notifications",
                }),
              ]),
            }),
          }),
        ]),
        flags: MessageFlagsBitField.Flags.Ephemeral,
      });
    });

    it("should display statistics with users and coverage gaps", async () => {
      const mockPreferences = [
        {
          id: "1",
          userId: "user1",
          enabled: true,
          startTime: "09:00",
          endTime: "17:00",
          user: { id: "user1", discordId: "111" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          userId: "user2",
          enabled: true,
          startTime: "18:00",
          endTime: "22:00",
          user: { id: "user2", discordId: "222" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "3",
          userId: "user3",
          enabled: false,
          startTime: "10:00",
          endTime: "20:00",
          user: { id: "user3", discordId: "333" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn((prismaService as any).treeNotifications_Preferences, "findMany").mockResolvedValue(mockPreferences);

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const callArg = mockInteraction.reply.mock.calls[0][0];
      expect(callArg.embeds[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "👥 Utilisateurs inscrits",
            value: "3 utilisateur(s) ont configuré leurs préférences",
          }),
          expect.objectContaining({
            name: "✅ Notifications activées",
            value: "2 utilisateur(s) recevront des notifications",
          }),
          expect.objectContaining({
            name: "⚠️ Périodes sans couverture",
          }),
        ])
      );
    });

    it("should display complete coverage when no gaps exist", async () => {
      const mockPreferences = [
        {
          id: "1",
          userId: "user1",
          enabled: true,
          startTime: "00:00",
          endTime: "11:59",
          user: { id: "user1", discordId: "111" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          userId: "user2",
          enabled: true,
          startTime: "12:00",
          endTime: "23:59",
          user: { id: "user2", discordId: "222" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn((prismaService as any).treeNotifications_Preferences, "findMany").mockResolvedValue(mockPreferences);

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const callArg = mockInteraction.reply.mock.calls[0][0];
      expect(callArg.embeds[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "✨ Couverture complète",
            value: "Au moins une personne recevra des notifications à tout moment de la journée !",
          }),
        ])
      );
    });

    it("should display least covered ranges when full coverage exists", async () => {
      const mockPreferences = [
        {
          id: "1",
          userId: "user1",
          enabled: true,
          startTime: "00:00",
          endTime: "23:59",
          user: { id: "user1", discordId: "111" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          userId: "user2",
          enabled: true,
          startTime: "09:00",
          endTime: "17:00",
          user: { id: "user2", discordId: "222" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "3",
          userId: "user3",
          enabled: true,
          startTime: "18:00",
          endTime: "22:00",
          user: { id: "user3", discordId: "333" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn((prismaService as any).treeNotifications_Preferences, "findMany").mockResolvedValue(mockPreferences);

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const callArg = mockInteraction.reply.mock.calls[0][0];
      
      // Should show complete coverage
      expect(callArg.embeds[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "✨ Couverture complète",
            value: "Au moins une personne recevra des notifications à tout moment de la journée !",
          }),
        ])
      );

      // Should show least covered ranges (areas with only 1 person)
      expect(callArg.embeds[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "📉 Périodes les moins couvertes",
            value: expect.stringContaining("1 personne(s)"),
          }),
        ])
      );
    });

    it("should handle overnight time ranges correctly", async () => {
      const mockPreferences = [
        {
          id: "1",
          userId: "user1",
          enabled: true,
          startTime: "22:00",
          endTime: "02:00",
          user: { id: "user1", discordId: "111" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn((prismaService as any).treeNotifications_Preferences, "findMany").mockResolvedValue(mockPreferences);

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const callArg = mockInteraction.reply.mock.calls[0][0];

      // Should show a gap from 02:00 to 22:00
      expect(callArg.embeds[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "⚠️ Périodes sans couverture",
            value: expect.stringContaining("02:"),
          }),
        ])
      );
    });

    it("should display next watering time when available", async () => {
      const mockPreferences = [
        {
          id: "1",
          userId: "user1",
          enabled: true,
          startTime: "09:00",
          endTime: "17:00",
          user: { id: "user1", discordId: "111" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn((prismaService as any).treeNotifications_Preferences, "findMany").mockResolvedValue(mockPreferences);

      // Set next watering date (2 hours from now)
      const nextWateringDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      service["nextWateringDate"] = nextWateringDate;

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const callArg = mockInteraction.reply.mock.calls[0][0];
      expect(callArg.embeds[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "🕐 Prochain arrosage",
            value: expect.stringContaining("2h"),
          }),
        ])
      );
    });

    it("should not display next watering if in the past", async () => {
      const mockPreferences = [];

      const mockInteraction = {
        user: { id: "123" },
        reply: jest.fn(),
      } as any;

      jest.spyOn((prismaService as any).treeNotifications_Preferences, "findMany").mockResolvedValue(mockPreferences);

      // Set next watering date in the past
      service["nextWateringDate"] = new Date(Date.now() - 1000);

      await service["treeNotificationsInfoCommand"]([mockInteraction]);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const callArg = mockInteraction.reply.mock.calls[0][0];
      const hasNextWateringField = callArg.embeds[0].data.fields.some((field) => field.name === "🕐 Prochain arrosage");
      expect(hasNextWateringField).toBe(false);
    });
  });

  describe("handleTreeMessage", () => {
    it("should return null if tree is not growing", async () => {
      const mockClient = {} as any;
      const description = "Some other message";

      const result = await service["handleTreeMessage"](description, mockClient);

      expect(result).toBeNull();
      expect(loggerService.debug).toHaveBeenCalledWith("Tree is not growing!");
    });

    it("should extract and schedule next watering time", async () => {
      const mockClient = {} as any;
      const futureTimestamp = Math.floor((Date.now() + 3600000) / 1000); // 1 hour from now
      const description = `It's growing right now\nThanks <@123456789> for watering the tree!\nNext watering: <t:${futureTimestamp}:R>`;

      jest.spyOn(schedulerRegistry, "doesExist").mockReturnValue(false);

      const result = await service["handleTreeMessage"](description, mockClient);

      expect(result).toBeGreaterThan(0);
      expect(schedulerRegistry.addTimeout).toHaveBeenCalledWith("tree-watering", expect.any(Object));
      expect(service["nextWateringDate"]).toBeInstanceOf(Date);
      expect(service["lastWateringUserId"]).toBe("123456789");
    });

    it("should not schedule if timestamp is in the past", async () => {
      const mockClient = {} as any;
      const pastTimestamp = Math.floor((Date.now() - 3600000) / 1000); // 1 hour ago
      const description = `It's growing right now\nThanks <@123456789> for watering the tree!\nNext watering: <t:${pastTimestamp}:R>`;

      const result = await service["handleTreeMessage"](description, mockClient);

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalledWith("Next watering timestamp is in the past");
    });

    it("should not schedule if timeout already exists", async () => {
      const mockClient = {} as any;
      const futureTimestamp = Math.floor((Date.now() + 3600000) / 1000);
      const description = `It's growing right now\nThanks <@123456789> for watering the tree!\nNext watering: <t:${futureTimestamp}:R>`;

      jest.spyOn(schedulerRegistry, "doesExist").mockReturnValue(true);

      const result = await service["handleTreeMessage"](description, mockClient);

      expect(result).toBeNull();
      expect(loggerService.debug).toHaveBeenCalledWith("Tree watering timeout already exists, skipping scheduling");
    });
  });
});
