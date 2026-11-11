import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function moveStock(tx: Tx, productId: number, deltaOut: number, reason: string, ref: string) {
  const qty = Math.round(deltaOut * 100) / 100;
  if (!qty) return;
  if (qty > 0) {
    const updated = await tx.product.updateMany({
      where: { id: productId, stock: { gte: qty } },
      data: { stock: { decrement: qty } },
    });
    if (updated.count !== 1) {
      const product = await tx.product.findUnique({ where: { id: productId } });
      const available = product ? Number(product.stock) : 0;
      const name = product?.name || 'el producto';
      throw new BadRequestException(
        available > 0
          ? `Solo hay ${available} de ${name}. No se puede vender ${qty}.`
          : `${name} no tiene existencia`,
      );
    }
  } else {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: Math.abs(qty) } },
    });
  }
  await tx.stockMove.create({
    data: { productId, qty: -qty, reason, ref },
  });
}
