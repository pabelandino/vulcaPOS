import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      const message = Array.isArray(raw) ? raw.join(', ') : raw || exception.message;
      response.status(exception.getStatus()).json({ message });
      return;
    }
    const message = exception instanceof Error ? exception.message : 'Error interno. Intente de nuevo.';
    console.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: message || 'Error interno. Intente de nuevo.' });
  }
}
