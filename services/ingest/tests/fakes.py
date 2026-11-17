"""Offline stand-in for the fastembed model: deterministic vectors, records inputs."""


class FakeModel:
    def __init__(self, dims: int = 4) -> None:
        self.dims = dims
        self.calls: list[list[str]] = []

    def embed(self, documents, batch_size: int = 32):
        docs = list(documents)
        self.calls.append(docs)
        # vector i = [i+1, 0, 0, ...] (unnormalised, like nomic's raw output)
        return [[float(i + 1) * 3] + [0.0] * (self.dims - 1) for i in range(len(docs))]
