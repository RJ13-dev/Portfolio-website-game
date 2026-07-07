"""Account + JWT auth routes."""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import RegisterView, MeView, ThrottledLoginView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", ThrottledLoginView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
]
