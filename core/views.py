"""
Page views.

Renders the portfolio site and the full Stimulus game. The portfolio holds the
single-page site (SVG eyes, router, glassmorphism, chatbot). The game template
is the full Stimulus client with player auth and progress saving wired in.
"""

from django.shortcuts import render
from django.views.decorators.cache import cache_page


@cache_page(60 * 5)
def portfolio(request):
    return render(request, "portfolio.html")


def game(request):
    return render(request, "game_full.html")
