import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, image_url, synced_data, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(`Query failed: ${error.message}`);

    return NextResponse.json({ messages: data || [] });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = getSupabaseClient();
    // Delete all messages (with filter to avoid accidental full-table delete)
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .not("id", "is", null);

    if (error) throw new Error(`Delete failed: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
