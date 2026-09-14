/**
 * Reference data for faculties and departments, used by the registration form.
 */
import "server-only";

import { prisma } from "@/lib/prisma";

export type FacultyWithDepartments = {
  id: string;
  name: string;
  code: string;
  departments: { id: string; name: string; code: string }[];
};

export async function listFacultiesWithDepartments(): Promise<
  FacultyWithDepartments[]
> {
  return prisma.faculty.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      departments: {
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}
