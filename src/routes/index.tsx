import { createFileRoute } from "@tanstack/react-router";
import { ClimbGame } from "@/components/climb-game";

export const Route = createFileRoute("/")({ component: ClimbGame });
