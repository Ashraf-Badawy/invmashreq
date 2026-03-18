/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { AIAction } from "../types";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: apiKey! });

const systemInstruction = `
أنت نظام إدارة مخزون ذكي مع نظام صلاحيات (Roles).
مهمتك هي تحويل طلبات المستخدم إلى أوامر JSON فقط بدون أي شرح.

النظام يحتوي على:
- أصناف (items)
- حركات (transactions)
- طلبيات (orders)
- مستخدمين (users)

أنواع المستخدمين:
- admin (له كل الصلاحيات)
- user (سحب وعرض فقط)
- observer (عرض فقط بدون أي تعديلات)

قواعد الصلاحيات:
- فقط admin يمكنه: إضافة صنف، تعديل المخزون، إضافة طلبية، استلام طلبية.
- user يمكنه: سحب من المخزون، عرض التقارير، الاستعلام عن المخزون.
- observer يمكنه فقط: عرض التقارير، الاستعلام عن المخزون. لا يمكنه السحب أو الإضافة أو التعديل.

إذا كانت العملية غير مصرح بها بناءً على الدور، أرجع: {"action": "unauthorized"}

قواعد العمليات:
1) إضافة صنف (admin فقط): {"action": "add_item", "name": "", "quantity": 0, "unit": ""}
2) سحب من المخزون (user/admin): {"action": "withdraw", "item": "", "quantity": 0, "user": "", "date": ""}
3) إضافة طلبية (admin فقط): {"action": "create_order", "item": "", "quantity": 0, "order_date": "", "delivery_date": "", "status": "pending"}
4) استلام طلبية (admin فقط): {"action": "receive_order", "item": "", "quantity": 0, "date": ""}
5) تقرير: {"action": "report", "type": "monthly | custom", "from": "", "to": ""}
6) معرفة المخزون: {"action": "check_stock", "item": ""}

قواعد عامة:
- الرد يكون JSON فقط.
- لا تضيف أي نص خارج JSON.
- كل الحقول اختيارية حسب ما يذكره المستخدم.
- إذا لم يذكر المستخدم قيمة، اجعلها null.
- التاريخ بصيغة YYYY-MM-DD.
- إذا لم يتم تحديد تاريخ، استخدم تاريخ اليوم (${new Date().toISOString().split('T')[0]}).
- افهم اللغة العربية العامية والمصرية.
`;

export async function parseUserRequest(prompt: string, userRole: 'admin' | 'user' | 'observer'): Promise<AIAction> {
  const model = "gemini-3-flash-preview";
  
  const response = await genAI.models.generateContent({
    model,
    contents: `الدور الحالي: ${userRole}\nالطلب: ${prompt}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          method: { type: Type.STRING },
          email: { type: Type.STRING },
          password: { type: Type.STRING },
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          item: { type: Type.STRING },
          user: { type: Type.STRING },
          date: { type: Type.STRING },
          order_date: { type: Type.STRING },
          delivery_date: { type: Type.STRING },
          status: { type: Type.STRING },
          type: { type: Type.STRING },
          from: { type: Type.STRING },
          to: { type: Type.STRING },
        },
        required: ["action"],
      },
    },
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");
    return JSON.parse(text) as AIAction;
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    return { action: "unauthorized" };
  }
}
