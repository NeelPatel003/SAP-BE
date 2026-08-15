import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Future Razorpay webhook — returns 501 so the contract is documented
 * without accepting payments or storing secrets.
 */
@ApiTags('accounts')
@Controller('accounts/payments/razorpay')
export class RazorpayWebhookStubController {
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  webhook(@Body() _body: unknown) {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        message:
          'Razorpay webhooks are not enabled. Stable invoice verify + booking first; see docs/razorpay-future.md',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
