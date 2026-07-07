"""Authentication and profile API views."""

from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import PlayerProfile
from .serializers import RegisterSerializer, PlayerProfileSerializer


class RegisterView(generics.CreateAPIView):
    """Create a new player account."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    # Cap new-account creation per IP (settings rate "register") to blunt bot
    # mass-registration.
    throttle_scope = "register"
    throttle_classes = [ScopedRateThrottle]


class ThrottledLoginView(TokenObtainPairView):
    """JWT login with a tight per-IP rate limit to slow credential brute force."""

    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]


class MeView(APIView):
    """Return the authenticated player's profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = PlayerProfile.objects.get(user=request.user)
        return Response(PlayerProfileSerializer(profile).data)
