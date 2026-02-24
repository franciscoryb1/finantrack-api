import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                (req) => req?.cookies?.access_token,
            ]), secretOrKey: process.env.JWT_SECRET!,
        });
    }

    async validate(payload: { sub: number; email: string }) {
        // Lo que retornás acá queda en request.user
        return {
            userId: payload.sub,
            email: payload.email,
        };
    }
}
