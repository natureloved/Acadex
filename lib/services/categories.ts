/**
 * Event category service.
 *
 * Categories are the colour-coded buckets on the calendar (Registration,
 * Lectures, Examinations, …). A category in use cannot be deleted, because
 * every event must keep one.
 */
import { prisma } from "../db";
import { fail, succeed, writeAudit, type Actor, type ServiceResult } from "./shared";

export type CategoryInput = { name: string; color: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  color: string;
  eventCount: number;
};

export async function listCategoriesForAdmin(): Promise<AdminCategory[]> {
  const categories = await prisma.eventCategory.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      _count: { select: { events: true } },
    },
    orderBy: { name: "asc" },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    color: category.color,
    eventCount: category._count.events,
  }));
}

/** "Mid-semester Break" → "mid-semester-break". */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function validate(input: CategoryInput): { ok: true; name: string; color: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const name = input.name.trim();
  const color = input.color.trim();

  if (!name) errors.push("A category name is required.");
  else if (name.length > 60) errors.push("Keep the category name under 60 characters.");

  if (!HEX_COLOR.test(color)) {
    errors.push("Choose a colour in #RRGGBB format.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, name, color };
}

export async function createCategory(
  actor: Actor,
  input: CategoryInput,
): Promise<ServiceResult<{ categoryId: string }>> {
  const validated = validate(input);
  if (!validated.ok) return fail(...validated.errors);

  let slug = slugify(validated.name);
  if (!slug) return fail("The category name must contain letters or numbers.");

  const clash = await prisma.eventCategory.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const categoryId = await prisma.$transaction(async (tx) => {
    const created = await tx.eventCategory.create({
      data: { name: validated.name, slug, color: validated.color },
      select: { id: true },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "CATEGORY_CREATED",
      entity: "EventCategory",
      entityId: created.id,
      meta: { name: validated.name, slug },
    });
    return created.id;
  });

  return succeed({ categoryId });
}

export async function updateCategory(
  actor: Actor,
  categoryId: string,
  input: CategoryInput,
): Promise<ServiceResult<{ categoryId: string }>> {
  const existing = await prisma.eventCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) return fail("That category no longer exists.");

  const validated = validate(input);
  if (!validated.ok) return fail(...validated.errors);

  const clash = await prisma.eventCategory.findFirst({
    where: { name: validated.name, id: { not: categoryId } },
    select: { id: true },
  });
  if (clash) return fail("Another category already uses that name.");

  await prisma.$transaction(async (tx) => {
    // The slug stays put so existing /calendar?category=… links keep working.
    await tx.eventCategory.update({
      where: { id: categoryId },
      data: { name: validated.name, color: validated.color },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "CATEGORY_UPDATED",
      entity: "EventCategory",
      entityId: categoryId,
      meta: { from: existing.name, to: validated.name, color: validated.color },
    });
  });

  return succeed({ categoryId });
}

export async function deleteCategory(
  actor: Actor,
  categoryId: string,
): Promise<ServiceResult<{ categoryId: string }>> {
  const existing = await prisma.eventCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, _count: { select: { events: true } } },
  });
  if (!existing) return fail("That category no longer exists.");

  if (existing._count.events > 0) {
    return fail(
      `${existing.name} is still used by ${existing._count.events} event${
        existing._count.events === 1 ? "" : "s"
      }. Re-categorise them first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventCategory.delete({ where: { id: categoryId } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "CATEGORY_DELETED",
      entity: "EventCategory",
      entityId: categoryId,
      meta: { name: existing.name },
    });
  });

  return succeed({ categoryId });
}
