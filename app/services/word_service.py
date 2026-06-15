"""Word service — vocabulary analysis and chunking utilities.

Provides the WordService facade used by wordbank API routes for
word chunking, batch vocabulary grading, and learning plan generation.
"""

import logging
from typing import Iterator, List

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


class WordService:
    """Service facade for vocabulary operations.

    Delegates LLM analysis to LLMService and provides utility
    helpers for word list processing.
    """

    def __init__(self) -> None:
        self.llm: LLMService = LLMService()

    @staticmethod
    def chunk_words(words: List[str], chunk_size: int = 50) -> Iterator[List[str]]:
        """Split a word list into fixed-size chunks for batch processing.

        Args:
            words: List of word strings to split.
            chunk_size: Maximum number of words per chunk.

        Yields:
            Sublists of words, each at most chunk_size long.
        """
        for i in range(0, len(words), chunk_size):
            yield words[i:i + chunk_size]
