import { Body, Controller, Post, HttpCode } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./login.dto";
import { RegisterDto } from "./register.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  @ApiResponse({ status: 201, description: "User registered" })
  @ApiResponse({ status: 409, description: "Username already registered" })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.username, body.password);
  }

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Log in and receive an access token and a refresh token" })
  @ApiResponse({ status: 200, description: "Login succeeded, tokens issued" })
  @ApiResponse({ status: 401, description: "Invalid username or password" })
  login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }
}
