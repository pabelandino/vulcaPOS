import { PrismaClient, PaymentMethod } from '@prisma/client';
import { ALL_SECTIONS, CASHIER_SECTIONS } from './auth/access';
import * as bcrypt from 'bcryptjs';
import { addDays, atLocalHour, businessToday, todayYmd } from './common/dates';
import { lineAmount, money, priceTotals } from './common/money';

const services = [
  ['PARCHE', 'Parche convencional', 'Parche en frío para pinchazo pequeño', 150, 40],
  ['HONGO', 'Parche tipo hongo', 'Reparación de orificio en la banda', 280, 90],
  ['VULC', 'Vulcanizado de cámara', 'Vulcanizado en caliente', 220, 60],
  ['PINCH', 'Reparación de pinchazo', 'Desmonte, parche y monte', 180, 45],
  ['MONT', 'Montaje y desmontaje', 'Por llanta', 120, 25],
  ['BAL', 'Balanceo', 'Por llanta, con pesos', 130, 30],
  ['ALIN', 'Alineación', 'Alineación de dirección', 450, 80],
  ['ROT', 'Rotación de llantas', 'Rotación de las cuatro llantas', 160, 30],
  ['NITRO', 'Nitrógeno', 'Llenado de cuatro llantas', 200, 55],
  ['VALV', 'Cambio de válvula', 'Válvula nueva incluida en el servicio', 90, 25],
  ['REV', 'Revisión de presión', 'Revisión y calibración', 40, 0],
  ['EMER', 'Servicio de emergencia', 'Atención fuera del local', 500, 120],
] as const;

const products = [
  ['LL-175', '7501000001751', 'Llanta 175/70 R13', 'Llantas', 1450, 2100, 18, 4],
  ['LL-185', '7501000001850', 'Llanta 185/65 R15', 'Llantas', 1680, 2450, 16, 4],
  ['LL-195', '7501000001959', 'Llanta 195/65 R15', 'Llantas', 1820, 2680, 14, 4],
  ['LL-205', '7501000002055', 'Llanta 205/55 R16', 'Llantas', 2100, 3150, 12, 3],
  ['LL-215', '7501000002154', 'Llanta 215/60 R16', 'Llantas', 2480, 3650, 8, 3],
  ['LL-265', '7501000002659', 'Llanta 265/70 R16', 'Llantas', 3200, 4700, 6, 2],
  ['CAM-13', '7501000000136', 'Cámara R13', 'Cámaras', 180, 320, 24, 6],
  ['CAM-14', '7501000000143', 'Cámara R14', 'Cámaras', 190, 340, 20, 6],
  ['CAM-15', '7501000000150', 'Cámara R15', 'Cámaras', 210, 380, 18, 5],
  ['CAM-16', '7501000000167', 'Cámara R16', 'Cámaras', 240, 420, 12, 4],
  ['VAL-TR', '7501000004131', 'Válvula TR413', 'Válvulas', 12, 35, 80, 20],
  ['VAL-MT', '7501000004148', 'Válvula metálica', 'Válvulas', 28, 70, 3, 10],
  ['PAR-R', '7501000005015', 'Parche redondo', 'Parches', 18, 45, 60, 15],
  ['PAR-H', '7501000005022', 'Parche hongo', 'Parches', 35, 80, 30, 8],
  ['PES-5', '7501000006050', 'Peso adhesivo 5 g', 'Pesos', 4, 15, 200, 40],
  ['PES-10', '7501000006104', 'Peso adhesivo 10 g', 'Pesos', 5, 18, 180, 40],
  ['NIT-T', '7501000007002', 'Tanque de nitrógeno', 'Insumos', 900, 1400, 4, 1],
  ['ACE-SP', '7501000008016', 'Spray sella pinchazos', 'Accesorios', 95, 180, 15, 4],
  ['TAP-V', '7501000008023', 'Tapón de válvula', 'Accesorios', 3, 10, 150, 30],
  ['PRO-L', '7501000008030', 'Protector de rin', 'Accesorios', 40, 90, 20, 5],
] as const;

const customers = [
  ['Carlos Méndez', '8881-2210', 'M184523', 'Hilux 2016'],
  ['María López', '8755-0142', 'M220184', 'Sentra 2018'],
  ['José Ramírez', '8244-7781', 'P103392', 'Canter 2014'],
  ['Ana Gutiérrez', '8901-3344', 'M301882', 'Accent 2020'],
  ['Luis Herrera', '8120-9090', 'M155700', 'Frontier 2019'],
  ['Taller San Judas', '2250-4411', null, 'Varios'],
  ['Rosa Castillo', '8788-1200', 'M442190', 'RAV4 2017'],
  ['Cooperativa El Volcán', '2277-8800', 'C019283', 'Bus'],
];

export async function ensureDemo() {
  const prisma = new PrismaClient();
  try {
    if ((await prisma.user.count()) > 0) return;
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seed(prisma: PrismaClient) {
  const adminHash = await bcrypt.hash('Admin123!', 10);
  const cajaHash = await bcrypt.hash('Caja123!', 10);
  await prisma.company.create({
    data: {
      name: 'Vulcanizadora El Caucho',
      tradeName: 'El Caucho',
      ruc: 'J0310000001234',
      address: 'De la rotonda El Güegüense, 2 cuadras al lago',
      phone: '2255-0142',
      email: 'caja@elcaucho.ni',
      city: 'Managua',
      voucherTitle: 'BOUCHER',
      headerLine: 'Vulcanizado, alineación y llantas',
      voucherFooter: 'Gracias por su preferencia.',
      warrantyNote: 'El parche tiene 7 días de garantía si la llanta no está reseca.',
      taxRate: 15,
      pricesIncludeTax: true,
      currency: 'C$',
      ticketWidth: 80,
    },
  });
  const main = await prisma.branch.create({
    data: {
      name: 'Sucursal Bello Horizonte',
      address: 'Pista Suburbana, Managua',
      phone: '2255-0142',
      registers: { create: [{ name: 'Caja 1' }, { name: 'Caja 2' }] },
    },
    include: { registers: true },
  });
  const alt = await prisma.branch.create({
    data: {
      name: 'Sucursal Altamira',
      address: 'De Seminole, 1 cuadra al sur',
      phone: '2278-4410',
      registers: { create: [{ name: 'Caja Altamira' }] },
    },
    include: { registers: true },
  });
  const admin = await prisma.user.create({
    data: { username: 'admin', passwordHash: adminHash, name: 'Patricia Rivas', role: 'ADMIN', access: [...ALL_SECTIONS] },
  });
  const cashier = await prisma.user.create({
    data: { username: 'caja', passwordHash: cajaHash, name: 'Mario Castillo', role: 'CASHIER', branchId: main.id, access: [...CASHIER_SECTIONS] },
  });
  const suppliers = await Promise.all(
    [
      ['Distribuidora Llantas del Pacífico', 'Ernesto Ruiz', '2270-1100', 'J0310000099001'],
      ['Insumos Automotrices Nora', 'Nora Díaz', '2251-3344', 'J0010000044112'],
      ['Cámaras y Válvulas Centro', 'Hugo Palma', '2244-9088', 'J0310000022008'],
    ].map(([name, contact, phone, ruc]) => prisma.supplier.create({ data: { name, contact, phone, ruc } })),
  );
  const productRows = [];
  for (const [index, item] of products.entries()) {
    const [sku, barcode, name, category, cost, price, stock, minStock] = item;
    productRows.push(
      await prisma.product.create({
        data: {
          sku,
          barcode,
          name,
          category,
          cost,
          price,
          stock,
          minStock,
          supplierId: suppliers[index % suppliers.length].id,
        },
      }),
    );
  }
  const serviceRows = [];
  for (const [code, name, description, price, cost] of services) {
    serviceRows.push(await prisma.serviceItem.create({ data: { code, name, description, price, cost } }));
  }
  const customerRows = [];
  for (const [name, phone, plate, vehicle] of customers) {
    customerRows.push(await prisma.customer.create({ data: { name: String(name), phone, plate, vehicle } }));
  }

  const stock = new Map(productRows.map((row) => [row.id, Number(row.stock)]));
  const rand = mulberry32(20261110);
  const today = todayYmd();
  let saleNumber = 1000;
  let orderNumber = 5000;
  const methods: PaymentMethod[] = ['CASH', 'CASH', 'CASH', 'CARD', 'TRANSFER', 'MIXED'];

  for (let ago = 40; ago >= 0; ago -= 1) {
    const day = addDays(today, -ago);
    const busy = ago < 7 ? 3 : 1;
    const saleCount = Math.floor(rand() * (busy + 2));
    for (let index = 0; index < saleCount; index += 1) {
      const branch = rand() > 0.82 ? alt : main;
      const product = productRows[Math.floor(rand() * productRows.length)];
      const quantity = product.category === 'Llantas' ? 1 : 1 + Math.floor(rand() * 2);
      const available = stock.get(product.id) || 0;
      if (available < quantity) continue;
      stock.set(product.id, available - quantity);
      const discount = rand() > 0.86 ? money(Number(product.price) * quantity * 0.05) : 0;
      const priced = [{ quantity, unitPrice: Number(product.price), unitCost: Number(product.cost), discount: 0 }];
      const totals = priceTotals(priced, discount, 15, true);
      const method = methods[Math.floor(rand() * methods.length)];
      const pay = payOf(method, totals.total, rand);
      const customer = customerRows[Math.floor(rand() * customerRows.length)];
      saleNumber += 1;
      const hour = 8 + Math.floor(rand() * 9);
      await prisma.sale.create({
        data: {
          number: saleNumber,
          kind: 'SALE',
          businessDate: day,
          createdAt: atLocalHour(day, hour, Math.floor(rand() * 50)),
          customerId: customer.id,
          customerName: customer.name,
          plate: customer.plate,
          vehicle: customer.vehicle,
          paymentMethod: method,
          ...pay,
          ...totals,
          branchId: branch.id,
          registerId: branch.id === main.id ? main.registers[0].id : alt.registers[0].id,
          cashierId: cashier.id,
          cashierName: cashier.name,
          items: {
            create: [
              {
                productId: product.id,
                sku: product.sku,
                name: product.name,
                quantity,
                unitPrice: Number(product.price),
                unitCost: Number(product.cost),
                discount: 0,
                amount: lineAmount(priced[0]),
                profit: money((Number(product.price) - Number(product.cost)) * quantity - discount),
              },
            ],
          },
        },
      });
      if (ago <= 6) {
        await prisma.stockMove.create({
          data: { productId: product.id, qty: -quantity, reason: 'Venta', ref: `SALE ${saleNumber}`, createdAt: atLocalHour(day, hour, 10) },
        });
      }
    }

    const orderCount = ago % 2 === 0 ? 1 + Math.floor(rand() * 2) : Math.floor(rand() * 2);
    for (let index = 0; index < orderCount; index += 1) {
      const service = serviceRows[Math.floor(rand() * serviceRows.length)];
      const extra = rand() > 0.55 ? serviceRows[Math.floor(rand() * serviceRows.length)] : null;
      const lines = [service, extra].filter((item, position, list) => item && list.indexOf(item) === position) as typeof serviceRows;
      const customer = customerRows[Math.floor(rand() * customerRows.length)];
      const priced = lines.map((item) => ({ quantity: 1, unitPrice: Number(item.price), unitCost: Number(item.cost), discount: 0 }));
      const discount = rand() > 0.9 ? 50 : 0;
      const totals = priceTotals(priced, discount, 15, true);
      const method = methods[Math.floor(rand() * methods.length)];
      const brought = rand() > 0.7 ? 'OTHER' : 'TIRE';
      orderNumber += 1;
      const hour = 8 + Math.floor(rand() * 9);
      await prisma.serviceOrder.create({
        data: {
          number: orderNumber,
          status: 'PAID',
          businessDate: day,
          createdAt: atLocalHour(day, hour, 20),
          paidAt: atLocalHour(day, hour, 40),
          customerId: customer.id,
          customerName: customer.name,
          phone: customer.phone,
          plate: customer.plate,
          vehicle: customer.vehicle,
          brought,
          broughtNote: brought === 'TIRE' ? 'Llanta delantera derecha con clavo' : 'Cámara desmontada',
          paymentMethod: method,
          ...payOf(method, totals.total, rand),
          ...totals,
          branchId: main.id,
          registerId: main.registers[0].id,
          cashierId: cashier.id,
          cashierName: cashier.name,
          lines: {
            create: lines.map((item) => ({
              kind: 'SERVICE',
              serviceId: item.id,
              code: item.code,
              name: item.name,
              quantity: 1,
              unitPrice: Number(item.price),
              unitCost: Number(item.cost),
              amount: Number(item.price),
              profit: money(Number(item.price) - Number(item.cost)),
            })),
          },
        },
      });
    }
  }

  const openNotes = [
    ['TIRE', 'Llanta 195/65 R15, clavo en la banda'],
    ['TIRE', 'Llanta trasera izquierda, corte lateral pequeño'],
    ['OTHER', 'Cámara R15 ya desmontada'],
    ['TIRE', 'Dos llantas de la Hilux para rotar y balancear'],
  ] as const;
  for (const [brought, note] of openNotes) {
    const service = serviceRows[orderNumber % serviceRows.length];
    const customer = customerRows[orderNumber % customerRows.length];
    const quantity = note.startsWith('Dos') ? 2 : 1;
    const totals = priceTotals([{ quantity, unitPrice: Number(service.price), unitCost: Number(service.cost) }], 0, 15, true);
    orderNumber += 1;
    await prisma.serviceOrder.create({
      data: {
        number: orderNumber,
        status: 'OPEN',
        businessDate: businessToday(),
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        plate: customer.plate,
        vehicle: customer.vehicle,
        brought,
        broughtNote: note,
        ...totals,
        cashierId: cashier.id,
        cashierName: cashier.name,
        branchId: main.id,
        lines: {
          create: [{
            kind: 'SERVICE',
            serviceId: service.id,
            code: service.code,
            name: service.name,
            quantity,
            unitPrice: Number(service.price),
            unitCost: Number(service.cost),
            amount: Number(service.price) * quantity,
            profit: money((Number(service.price) - Number(service.cost)) * quantity),
          }],
        },
      },
    });
  }

  for (const row of productRows) {
    await prisma.product.update({ where: { id: row.id }, data: { stock: stock.get(row.id) || 0 } });
  }

  const sample = await prisma.sale.findFirst({ where: { kind: 'SALE', status: 'PAID' }, include: { items: true }, orderBy: { id: 'desc' } });
  if (sample?.items[0]?.productId) {
    const item = sample.items[0];
    saleNumber += 1;
    const totals = priceTotals([{ quantity: 1, unitPrice: Number(item.unitPrice), unitCost: Number(item.unitCost) }], 0, 15, true);
    await prisma.saleItem.update({ where: { id: item.id }, data: { returnedQty: 1 } });
    await prisma.product.update({ where: { id: item.productId ?? undefined }, data: { stock: { increment: 1 } } });
    await prisma.sale.create({
      data: {
        number: saleNumber,
        kind: 'RETURN',
        businessDate: businessToday(),
        customerName: sample.customerName,
        plate: sample.plate,
        paymentMethod: 'CASH',
        cashAmount: totals.total,
        ...totals,
        notes: `Devolución de venta ${sample.number}`,
        relatedSaleId: sample.id,
        branchId: sample.branchId,
        registerId: sample.registerId,
        cashierId: cashier.id,
        cashierName: cashier.name,
        items: {
          create: [{
            productId: item.productId,
            sku: item.sku,
            name: item.name,
            quantity: 1,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            amount: item.unitPrice,
            profit: money(Number(item.unitPrice) - Number(item.unitCost)),
          }],
        },
      },
    });
  }

  const cashierSession = await prisma.cashSession.create({
    data: {
      registerId: main.registers[0].id,
      userId: cashier.id,
      openingAmount: 1500,
      openedAt: atLocalHour(businessToday(), 8, 0),
    },
  });
  await prisma.cashSession.create({
    data: {
      registerId: main.registers[1].id,
      userId: admin.id,
      openingAmount: 800,
      openedAt: atLocalHour(businessToday(), 8, 5),
    },
  });
  await prisma.sale.updateMany({
    where: { businessDate: businessToday(), branchId: main.id, cashSessionId: null },
    data: { cashSessionId: cashierSession.id, registerId: main.registers[0].id },
  });
  await prisma.serviceOrder.updateMany({
    where: { businessDate: businessToday(), status: 'PAID', branchId: main.id },
    data: { cashSessionId: cashierSession.id, registerId: main.registers[0].id },
  });
  for (let ago = 1; ago <= 8; ago += 1) {
    const day = addDays(today, -ago);
    const expected = 1500 + Math.round(rand() * 4000);
    const difference = ago === 3 ? -40 : 0;
    await prisma.cashSession.create({
      data: {
        registerId: main.registers[0].id,
        userId: cashier.id,
        status: 'CLOSED',
        openingAmount: 1500,
        openedAt: atLocalHour(day, 8, 0),
        closedAt: atLocalHour(day, 17, 30),
        expectedAmount: expected,
        countedAmount: expected + difference,
        difference,
        notes: difference ? 'Faltante en monedas' : 'Arqueo cuadrado',
      },
    });
  }
}

function payOf(method: PaymentMethod, total: number, rand: () => number) {
  if (method === 'CARD') return { cashAmount: 0, cardAmount: total, transferAmount: 0, changeAmount: 0 };
  if (method === 'TRANSFER') return { cashAmount: 0, cardAmount: 0, transferAmount: total, changeAmount: 0 };
  if (method === 'MIXED') {
    const cashAmount = money(total * 0.6);
    return { cashAmount, cardAmount: money(total - cashAmount), transferAmount: 0, changeAmount: 0 };
  }
  const bills = total + (rand() > 0.5 ? 100 : 0);
  return { cashAmount: total, cardAmount: 0, transferAmount: 0, changeAmount: money(bills - total) };
}

function mulberry32(seed: number) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
