import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/data?type=orders|feeding_records|health_records|expenses|all
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const supabase = getSupabaseClient();

    if (type === 'all') {
      const [orders, feeding, health, expenses] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: true }),
        supabase.from('feeding_records').select('*').order('created_at', { ascending: true }),
        supabase.from('health_records').select('*').order('created_at', { ascending: true }),
        supabase.from('expenses').select('*').order('created_at', { ascending: true }),
      ]);
      return NextResponse.json({
        orders: orders.data || [],
        feedingRecords: feeding.data || [],
        healthRecords: health.data || [],
        expenses: expenses.data || [],
      });
    }

    const { data, error } = await supabase.from(type).select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET /api/data error:', error);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}

// POST /api/data - upsert a record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, data } = body as { table: string; data: Record<string, unknown> };

    if (!table || !data) {
      return NextResponse.json({ error: 'Missing table or data' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from(table).upsert(data);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/data error:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}

// PUT /api/data - update a record
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, id, data } = body as { table: string; id: string; data: Record<string, unknown> };

    if (!table || !id || !data) {
      return NextResponse.json({ error: 'Missing table, id, or data' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from(table).update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/data error:', error);
    return NextResponse.json({ error: 'Failed to update data' }, { status: 500 });
  }
}

// DELETE /api/data - delete records
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, id } = body as { table: string; id?: string };

    if (!table) {
      return NextResponse.json({ error: 'Missing table' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    
    if (id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    } else {
      // Delete all records in table
      const { error } = await supabase.from(table).delete().neq('id', '');
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/data error:', error);
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 });
  }
}
