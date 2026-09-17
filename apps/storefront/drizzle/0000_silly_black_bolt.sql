CREATE TABLE "cart_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"merchandise_id" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"handle" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"seo" jsonb NOT NULL,
	"updated_at" text NOT NULL,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"member_since" text NOT NULL,
	"loyalty" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"created_at" text NOT NULL,
	"status" text NOT NULL,
	"lines" jsonb NOT NULL,
	"total" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"handle" text NOT NULL,
	"body" text NOT NULL,
	"body_summary" text NOT NULL,
	"seo" jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "pages_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"charge_id" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"available_for_sale" boolean NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"description_html" text NOT NULL,
	"options" jsonb NOT NULL,
	"price_range" jsonb NOT NULL,
	"variants" jsonb NOT NULL,
	"featured_image" jsonb NOT NULL,
	"images" jsonb NOT NULL,
	"seo" jsonb NOT NULL,
	"tags" text[] NOT NULL,
	"updated_at" text NOT NULL,
	"collections" text[] NOT NULL,
	"best_selling_rank" integer NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "products_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;