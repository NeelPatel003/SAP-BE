import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Min 10 chars, at least one letter and one number. */
export const PASSWORD_MIN = 10;

@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    if (value.length < PASSWORD_MIN) return false;
    if (!/[A-Za-z]/.test(value)) return false;
    if (!/[0-9]/.test(value)) return false;
    return true;
  }

  defaultMessage(_args: ValidationArguments) {
    return `password must be at least ${PASSWORD_MIN} characters and include a letter and a number`;
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}

export function assertPasswordPolicy(password: string) {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error(
      `password must be at least ${PASSWORD_MIN} characters and include a letter and a number`,
    );
  }
}
