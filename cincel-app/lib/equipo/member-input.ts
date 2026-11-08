/**
 * The collaborator editor's save payload (`saveMemberAction`, Query
 * Migration 6): the staff fields, the profile, the puestos and the system
 * access in one input, so the save is one POST and one transaction.
 * Client-safe: zod only.
 */
import { z } from "zod";

import { UuidArraySchema, UuidSchema } from "@/lib/validation/project-flow";

const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const MemberStaffInputSchema = z.object({
  name: z.string().trim().min(1, "EMPTY").max(120),
  lastName: optionalText(120),
  /** The system access role (`staff.role`). Left out for Google-managed staff. */
  role: z.string().trim().max(60).optional(),
  email: z.string().trim().max(320),
  phone: optionalText(40),
  capacity: z.number().int().min(1).max(1000),
  availability: optionalText(120),
});

export const MemberProfileInputSchema = z.object({
  birthDate: optionalText(20),
  nationality: optionalText(120),
  address: optionalText(500),
  maritalStatus: optionalText(60),
  homePhone: optionalText(40),
  personalEmail: optionalText(320),
  curp: optionalText(40),
  rfc: optionalText(40),
  emergencyContactName: optionalText(120),
  emergencyContactRelation: optionalText(60),
  emergencyContactPhone: optionalText(40),
  emergencyContactAddress: optionalText(500),
});

export const MemberCredentialInputSchema = z.object({
  enableAccess: z.boolean(),
  temporaryPassword: z.string().min(8).max(200).optional(),
});

export const MemberEditorInputSchema = z.object({
  /** null creates a collaborator; an id edits that one. */
  staffId: UuidSchema.nullable(),
  staff: MemberStaffInputSchema,
  profile: MemberProfileInputSchema,
  /** The manual puestos. Left out for Google-managed staff (Workspace sets them). */
  positionIds: UuidArraySchema.optional(),
  /** Left out when the viewer can't change access or the person signs in with Google. */
  credential: MemberCredentialInputSchema.optional(),
});

export type MemberEditorInput = z.input<typeof MemberEditorInputSchema>;
