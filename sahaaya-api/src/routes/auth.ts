import { FastifyInstance } from "fastify";
import { z } from "zod";
import { User } from "../models/User";
import { signToken } from "../lib/jwt";
import { parse } from "../lib/validate";
import { auditLog } from "../lib/audit";

const DemoLoginSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(80),
    // Normalize common formatting (spaces, dashes - e.g. "077 123 4567") before
    // validating, so the example in our own error message actually passes.
    phone: z
      .string()
      .transform((value) => value.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^(?:\+94|0)7\d{8}$/, "Enter a valid Sri Lankan mobile number, e.g. 077 123 4567")),
    role: z.enum(["communicator", "caregiver"], {
      error: "Role must be 'communicator' or 'caregiver'",
    }),
    // Required for caregivers only: a new request is emailed to them, not just
    // pushed to their dashboard, so we need a real address for that role.
    email: z.string().email("Enter a valid email address").optional(),
  })
  .refine((data) => data.role !== "caregiver" || Boolean(data.email), {
    message: "Email is required for caregivers so requests can be emailed to them",
    path: ["email"],
  });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/demo-login", async (request, reply) => {
    const result = parse(DemoLoginSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const { name, phone, role, email } = result.data;

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ name, phone, role, email });
    } else if (email && user.email !== email) {
      user.email = email;
      await user.save();
    }

    const token = signToken({ sub: user._id.toString(), role: user.role });

    auditLog({ route: "/auth/demo-login", actorId: user._id.toString(), outcome: "success" });

    return reply.code(200).send({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        preferences: user.preferences,
      },
    });
  });
}
