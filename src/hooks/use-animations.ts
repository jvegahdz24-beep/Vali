'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* ── useFadeIn ── */
export function useFadeIn(delay = 0) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return {
    ref,
    isVisible,
    style: {
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
    },
  }
}

/* ── useSlideUp ── */
export function useSlideUp(delay = 0) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return {
    style: {
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
    },
  }
}

/* ── useCountUp ── */
export function useCountUp(
  end: number,
  duration: number = 1200,
  startOnMount: boolean = true
) {
  const [count, setCount] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!startOnMount || end === 0) return

    const startTime = performance.now()

    const step = () => {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(easedProgress * end)

      setCount(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      }
    }

    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [startOnMount, end, duration])

  return count
}

/* ── useIntersectionObserver ── */
export function useIntersectionObserver(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null)
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting)
    }, {
      threshold: 0.1,
      ...options,
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [options])

  return { ref, isIntersecting }
}

/* ── useStaggeredAnimation ── */
export function useStaggeredAnimation(itemCount: number, baseDelay: number = 60) {
  return Array.from({ length: itemCount }, (_, i) => ({
    style: {
      opacity: 0,
      transform: 'translateY(12px)',
      animation: `vf-slideUp 0.4s ease-out ${i * baseDelay}ms forwards`,
    },
  }))
}
