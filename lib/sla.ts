export function ambangWarningMenit(prioritas: string): number {
  switch (prioritas) {
    case "P0":
      return 2;
    case "P1":
      return 5;
    case "P2":
    case "P3":
    default:
      return 15;
  }
}
