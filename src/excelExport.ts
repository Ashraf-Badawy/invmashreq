import * as XLSXModule from 'xlsx-js-style';
const XLSX = (XLSXModule as any).default || XLSXModule;
import { format } from 'date-fns';
import { InventoryItem, Transaction, Order } from './types';

export function exportMovementsToExcel(
  items: InventoryItem[],
  transactions: Transaction[],
  orders: Order[],
  reportStartDate: string,
  reportEndDate: string,
  fileName: string
) {
  const parseDate = (dStr: string) => {
    if (!dStr) return new Date(0);
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  const formatMovementDate = (dStr: string) => {
    if (!dStr) return '';
    if (dStr.includes('T')) {
      try {
        return format(new Date(dStr), 'yyyy-MM-dd HH:mm:ss');
      } catch {
        return dStr;
      }
    }
    return dStr;
  };

  const aoa: any[][] = [];
  interface ExcelRowMetadata {
    type: 'header' | 'receive_tx' | 'withdraw_tx' | 'return_tx' | 'order' | 'pre_order_stock' | 'post_order_stock' | 'summary' | 'empty';
    itemName?: string;
  }
  const metadata: ExcelRowMetadata[] = [];

  // 1. Add Sheet Header
  aoa.push(["اسم الصنف", "التاريخ والوقت", "نوع الحركة", "الوارد (+)", "المنصرف (-)", "رصيد المخزن", "المستخدم", "ملاحظات / حالة الحركة"]);
  metadata.push({ type: 'header' });

  // 2. Iterate through each item to generate its separate section
  items.forEach(item => {
    // Find transactions of this item
    const itemTransactions = transactions.filter(t => {
      const matchesName = t.itemName && t.itemName.trim() === item.name.trim();
      const matchesId = t.itemId === item.id;
      return matchesName || matchesId;
    });

    // Find orders of this item
    const itemOrders = orders.filter(o => o.item && o.item.trim() === item.name.trim());

    // Smart Matching to prevent double counting:
    // We match delivered orders with their corresponding 'receive' transactions.
    const matchedTxIds = new Set<string>();
    const matchedOrderIds = new Set<string>();
    const orderTxPairs: { order: Order; tx: Transaction }[] = [];

    const deliveredOrders = itemOrders.filter(o => o.status === 'delivered');
    const receiveTransactions = itemTransactions.filter(t => t.type === 'receive');

    deliveredOrders.forEach(o => {
      // Find an unmatched 'receive' transaction of the same quantity and close delivery date
      const match = receiveTransactions.find(t => 
        !matchedTxIds.has(t.id) &&
        t.quantity === o.quantity &&
        (
          t.date.startsWith(o.delivery_date || '') || 
          (o.delivery_date && o.delivery_date.startsWith(t.date)) ||
          Math.abs(parseDate(t.date).getTime() - parseDate(o.delivery_date || '').getTime()) <= 24 * 60 * 60 * 1000
        )
      );

      if (match) {
        matchedTxIds.add(match.id);
        matchedOrderIds.add(o.id);
        orderTxPairs.push({ order: o, tx: match });
      }
    });

    // Define our unified movement interface
    interface UnifiedMovement {
      itemName: string;
      dateStr: string;
      dateObj: Date;
      type: string;
      incoming: number;
      outgoing: number;
      isPhysical: boolean;
      user: string;
      notes: string;
      rowType: 'receive_tx' | 'withdraw_tx' | 'return_tx' | 'order';
    }

    const movements: UnifiedMovement[] = [];

    // Add normal (unmatched) transactions
    itemTransactions.forEach(t => {
      if (matchedTxIds.has(t.id)) return; // Skip because it is represented as a delivered order

      movements.push({
        itemName: item.name,
        dateStr: formatMovementDate(t.date),
        dateObj: parseDate(t.date),
        type: t.type === 'receive' ? 'إيداع مخزون' : t.type === 'withdraw' ? 'سحب مخزون' : 'مرتجع صنف',
        incoming: t.type === 'receive' || t.type === 'return' ? t.quantity : 0,
        outgoing: t.type === 'withdraw' ? t.quantity : 0,
        isPhysical: true,
        user: t.user || 'غير محدد',
        notes: t.type === 'receive' ? 'إضافة إلى الرفوف' : t.type === 'withdraw' ? 'صرف من المستودع' : 'إرجاع إلى الرفوف',
        rowType: t.type === 'receive' ? 'receive_tx' : t.type === 'withdraw' ? 'withdraw_tx' : 'return_tx'
      });
    });

    // Add matched delivered orders (unified representation)
    orderTxPairs.forEach(pair => {
      movements.push({
        itemName: item.name,
        dateStr: formatMovementDate(pair.order.delivery_date || pair.order.order_date),
        dateObj: parseDate(pair.order.delivery_date || pair.order.order_date),
        type: 'استلام طلبية (تم التوصيل)',
        incoming: pair.order.quantity,
        outgoing: 0,
        isPhysical: true,
        user: pair.tx.user || 'إضافة طلبية',
        notes: `طلبية تم طلبها بتاريخ ${pair.order.order_date} وتم استلامها وإضافتها للمستودع`,
        rowType: 'order'
      });
    });

    // Add other unmatched orders (pending, cancelled, or unmatched delivered)
    itemOrders.forEach(o => {
      if (matchedOrderIds.has(o.id)) return; // Already unified and handled

      if (o.status === 'pending') {
        movements.push({
          itemName: item.name,
          dateStr: formatMovementDate(o.order_date),
          dateObj: parseDate(o.order_date),
          type: 'طلب شحنة جديدة (طلبية قيد الانتظار)',
          incoming: 0,
          outgoing: 0,
          isPhysical: false,
          user: 'إضافة طلبية',
          notes: 'طلبية معلقة وبانتظار الاستلام',
          rowType: 'order'
        });
      } else if (o.status === 'delivered') {
        // If delivered but unmatched with a transaction, keep it as delivered
        movements.push({
          itemName: item.name,
          dateStr: formatMovementDate(o.delivery_date || o.order_date),
          dateObj: parseDate(o.delivery_date || o.order_date),
          type: 'استلام طلبية (تم التوصيل)',
          incoming: o.quantity,
          outgoing: 0,
          isPhysical: true,
          user: 'إضافة طلبية',
          notes: `طلبية تم طلبها بتاريخ ${o.order_date} وتم استلامها`,
          rowType: 'order'
        });
      } else {
        movements.push({
          itemName: item.name,
          dateStr: formatMovementDate(o.order_date),
          dateObj: parseDate(o.order_date),
          type: 'طلبية ملغاة / غير مستلمة',
          incoming: 0,
          outgoing: 0,
          isPhysical: false,
          user: 'إضافة طلبية',
          notes: 'طلبية ملغاة',
          rowType: 'order'
        });
      }
    });

    // Sort all movements chronologically (from oldest to newest)
    const sortedMovements = movements.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    // Current stock is item.quantity
    const currentStock = item.quantity;

    // Work backwards to find initialStock (Opening Balance)
    let netChange = 0;
    sortedMovements.forEach(m => {
      if (m.isPhysical) {
        netChange += (m.incoming - m.outgoing);
      }
    });

    let initialStock = currentStock - netChange;
    if (initialStock < 0) {
      initialStock = 0;
    }

    // We track running physical stock to represent history accurately
    let runningStock = initialStock;

    // Add Opening Balance Row (رصيد أول المدة) if there is any movement history
    if (sortedMovements.length > 0) {
      aoa.push([
        item.name,
        sortedMovements[0].dateStr,
        "رصيد أول المدة (الرصيد الافتتاحي)",
        "",
        "",
        initialStock,
        "النظام",
        "الرصيد الافتتاحي في بداية الحركات"
      ]);
      metadata.push({
        type: 'pre_order_stock',
        itemName: item.name
      });
    }

    // 3. Add movement rows to aoa
    sortedMovements.forEach(m => {
      const isOrder = m.rowType === 'order' && m.isPhysical && m.incoming > 0;

      if (isOrder) {
        // Add row BEFORE order showing the stock level before the order was received
        aoa.push([
          item.name,
          m.dateStr,
          "إجمالي الكمية الموجودة بالمخزن قبل الطلبية مباشرة",
          "",
          "",
          runningStock,
          "النظام",
          "رصيد المخزن المحتسب قبل التوريد مباشرة"
        ]);
        metadata.push({
          type: 'pre_order_stock',
          itemName: item.name
        });
      }

      if (m.isPhysical) {
        runningStock += (m.incoming - m.outgoing);
      }

      aoa.push([
        m.itemName,
        m.dateStr,
        m.type,
        m.incoming > 0 ? m.incoming : "",
        m.outgoing > 0 ? m.outgoing : "",
        runningStock,
        m.user,
        m.notes
      ]);
      metadata.push({ 
        type: m.rowType, 
        itemName: item.name 
      });

      if (isOrder) {
        // Add row AFTER order showing the stock level after the order was received
        aoa.push([
          item.name,
          m.dateStr,
          "مجموع المخزن بعد استلام الطلبية مباشرة",
          "",
          "",
          runningStock,
          "النظام",
          "رصيد المخزن المحتسب بعد توريد الكمية"
        ]);
        metadata.push({
          type: 'post_order_stock',
          itemName: item.name
        });
      }
    });

    // 4. Add Summary Row showing current stock
    aoa.push([
      item.name,
      "",
      "إجمالي الرصيد الحالي بالمخزن",
      "",
      "",
      item.quantity,
      "",
      "مخزون متوفر حالياً بالمستودع"
    ]);
    metadata.push({ 
      type: 'summary', 
      itemName: item.name 
    });

    // 5. Add an empty separator row
    aoa.push(["", "", "", "", "", "", "", ""]);
    metadata.push({ type: 'empty' });
  });

  // Create Worksheet
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths for 8 columns
  ws['!cols'] = [
    { wch: 20 }, // اسم الصنف
    { wch: 20 }, // التاريخ والوقت
    { wch: 25 }, // نوع الحركة
    { wch: 12 }, // الوارد (+)
    { wch: 12 }, // المنصرف (-)
    { wch: 15 }, // رصيد المخزن
    { wch: 15 }, // المستخدم
    { wch: 35 }  // ملاحظات / حالة الحركة
  ];

  // Apply styles to each cell based on metadata
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    const rowMeta = metadata[R];
    if (!rowMeta) continue;

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cell_ref];
      if (!cell) continue;

      // Base styles
      cell.s = {
        font: { name: "Calibri", sz: 11 },
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } }
        }
      };

      if (rowMeta.type === 'header') {
        cell.s.fill = { fgColor: { rgb: "1E293B" } }; // Deep Slate
        cell.s.font = { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
      } else if (rowMeta.type === 'order') {
        // Soft Yellow/Amber for Orders
        cell.s.fill = { fgColor: { rgb: "FEF3C7" } }; 
        cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "92400E" } };
      } else if (rowMeta.type === 'pre_order_stock') {
        // Soft Orange/Peach for Stock before Orders
        cell.s.fill = { fgColor: { rgb: "FFEDD5" } }; 
        cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "9A3412" } };
      } else if (rowMeta.type === 'post_order_stock') {
        // Soft Indigo/Blue for Stock after Orders
        cell.s.fill = { fgColor: { rgb: "E0E7FF" } }; 
        cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "3730A3" } };
      } else if (rowMeta.type === 'receive_tx' || rowMeta.type === 'return_tx') {
        // Distinct Soft Green/Mint for Received/Returned Quantities
        cell.s.fill = { fgColor: { rgb: "DCFCE7" } }; 
        cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "15803D" } };
      } else if (rowMeta.type === 'summary') {
        // Soft Green/Emerald for Current Stock Balance
        cell.s.fill = { fgColor: { rgb: "D1FAE5" } }; 
        cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "065F46" } };
      } else if (rowMeta.type === 'empty') {
        cell.s = {
          border: {} // Clean empty row
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير الحركات والمخزون");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
