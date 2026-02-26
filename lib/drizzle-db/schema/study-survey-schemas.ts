import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./drizzle-auth-schemas";

export const study = pgTable(
  "studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    configs: jsonb("configs").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("studies_key_uq").on(table.key)],
);

export const survey = pgTable(
  "surveys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("surveys_study_id_idx").on(table.studyId),
    uniqueIndex("surveys_study_id_key_uq").on(table.studyId, table.key),
  ],
);

export const participant = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("participants_study_id_idx").on(table.studyId),
    index("participants_user_id_idx").on(table.userId),
    uniqueIndex("participants_study_id_user_id_uq").on(table.studyId, table.userId),
  ],
);

export const response = pgTable(
  "responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => survey.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("responses_participant_id_idx").on(table.participantId),
    index("responses_survey_id_submitted_at_idx").on(table.surveyId, table.submittedAt),
    index("responses_participant_id_survey_id_submitted_at_idx").on(
      table.participantId,
      table.surveyId,
      table.submittedAt,
    ),
  ],
);

export const studyRelations = relations(study, ({ many }) => ({
  surveys: many(survey),
  participants: many(participant),
}));

export const surveyRelations = relations(survey, ({ one, many }) => ({
  study: one(study, {
    fields: [survey.studyId],
    references: [study.id],
  }),
  responses: many(response),
}));

export const participantRelations = relations(participant, ({ one, many }) => ({
  study: one(study, {
    fields: [participant.studyId],
    references: [study.id],
  }),
  user: one(user, {
    fields: [participant.userId],
    references: [user.id],
  }),
  responses: many(response),
}));

export const responseRelations = relations(response, ({ one }) => ({
  participant: one(participant, {
    fields: [response.participantId],
    references: [participant.id],
  }),
  survey: one(survey, {
    fields: [response.surveyId],
    references: [survey.id],
  }),
}));

export type Study = typeof study.$inferSelect;
export type NewStudy = typeof study.$inferInsert;
export type Survey = typeof survey.$inferSelect;
export type NewSurvey = typeof survey.$inferInsert;
export type Participant = typeof participant.$inferSelect;
export type NewParticipant = typeof participant.$inferInsert;
export type Response = typeof response.$inferSelect;
export type NewResponse = typeof response.$inferInsert;
