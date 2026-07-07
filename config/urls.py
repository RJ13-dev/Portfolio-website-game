"""Root URL configuration."""

from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("admin/", admin.site.urls),

    # Page routes (portfolio + game shell) live in core
    path("", include("core.urls")),

    # API namespaces
    path("api/auth/", include("accounts.urls")),
    path("api/games/", include("games.urls")),
    path("api/", include("core.api.urls")),
]

# API docs enumerate every endpoint + parameter, so only expose them in
# development. In production, generate the schema offline if you need it.
if settings.DEBUG:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/docs/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        ),
    ]
