import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "../components/workspace/invite-page";
export const Route = createFileRoute("/invite")({ component: InvitePage });
