CREATE TABLE "chat_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "chat_proposals_kind_valid" CHECK ("chat_proposals"."kind" in ('itinerary', 'preference')),
	CONSTRAINT "chat_proposals_status_valid" CHECK ("chat_proposals"."status" in ('pending', 'accepted', 'rejected')),
	CONSTRAINT "chat_proposals_payload_object" CHECK (jsonb_typeof("chat_proposals"."payload") = 'object'),
	CONSTRAINT "chat_proposals_decided_consistent" CHECK (("chat_proposals"."status" = 'pending') = ("chat_proposals"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_proposals_session_created_idx" ON "chat_proposals" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_proposals_message_id_idx" ON "chat_proposals" USING btree ("message_id");